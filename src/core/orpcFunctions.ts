import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm"
import type { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { z } from "zod"
import { generateId } from "./generateId"
import {
  buildPushNotificationPayload,
  createPushRequestDetails,
  type VapidDetails,
} from "./push-server"
import {
  PushSubscriptionInputSchema,
  conversationMembersTable,
  conversationUserStateTable,
  conversationsTable,
  messageAttachmentsTable,
  messageMentionsTable,
  messagesTable,
  pushSubscriptionsTable,
  type Conversation,
  type ConversationWithUserState,
  type Message,
  type MessageAttachment,
  type MessageMention,
  type MessageRecord,
  type PushSubscriptionRecord,
} from "./schema"
import type { ServerEvent } from "./sync-events"

type AttachmentUploadInput = {
  fileName: string
  contentType: string
  sizeBytes: number
  bytes: ArrayBuffer
}

const AttachmentFileSchema = z.custom<File>((value) => value instanceof File)
const DirectConversationMembersInputSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
})

function normalizeTiptapJson(tiptapJson: string | null | undefined) {
  if (!tiptapJson) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(tiptapJson)
  } catch {
    throw new Error("Invalid Tiptap JSON")
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid Tiptap JSON")
  }

  return JSON.stringify(parsed)
}

type OrpcContext = {
  db: ReturnType<typeof drizzle>
  env: Cloudflare.Env
  getWebSockets: (tag?: string) => WebSocket[]
  userId: string
  vapidDetails: VapidDetails | null
  waitUntil: (promise: Promise<unknown>) => void
}

const base = os.$context<OrpcContext>()

const getConversations = base.handler(
  async ({ context }): Promise<ConversationWithUserState[]> => {
    const normalizedUserId = context.userId.trim()
    const conversationLastMessageSubquery = context.db
      .select({
        conversationId: messagesTable.conversationId,
        lastMessageAt: sql<string>`max(${messagesTable.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(messagesTable)
      .groupBy(messagesTable.conversationId)
      .as("conversation_last_message")

    return context.db
      .select({
        id: conversationsTable.id,
        type: conversationsTable.type,
        name: conversationsTable.name,
        createdAt: conversationsTable.createdAt,
        lastViewedAt: conversationUserStateTable.lastViewedAt,
        lastMessageAt: conversationLastMessageSubquery.lastMessageAt,
      })
      .from(conversationsTable)
      .leftJoin(
        conversationUserStateTable,
        and(
          eq(conversationUserStateTable.conversationId, conversationsTable.id),
          eq(conversationUserStateTable.userId, normalizedUserId),
        ),
      )
      .leftJoin(
        conversationLastMessageSubquery,
        eq(
          conversationLastMessageSubquery.conversationId,
          conversationsTable.id,
        ),
      )
      .orderBy(desc(conversationsTable.createdAt))
  },
)

const getConversationById = base
  .input(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(
    async ({ context, input }): Promise<ConversationWithUserState | null> => {
      const normalizedConversationId = input.conversationId.trim()
      const normalizedUserId = context.userId.trim()

      if (!normalizedConversationId) {
        throw new Error("Conversation id is required")
      }

      const conversation = await context.db
        .select({
          id: conversationsTable.id,
          type: conversationsTable.type,
          name: conversationsTable.name,
          createdAt: conversationsTable.createdAt,
        })
        .from(conversationsTable)
        .where(eq(conversationsTable.id, normalizedConversationId))
        .limit(1)

      const currentConversation = conversation[0]
      if (!currentConversation) {
        return null
      }

      const userState = normalizedUserId
        ? await context.db
            .select({
              lastViewedAt: conversationUserStateTable.lastViewedAt,
            })
            .from(conversationUserStateTable)
            .where(
              and(
                eq(
                  conversationUserStateTable.conversationId,
                  normalizedConversationId,
                ),
                eq(conversationUserStateTable.userId, normalizedUserId),
              ),
            )
            .limit(1)
        : []

      const lastMessage = await context.db
        .select({
          lastMessageAt: sql<string | null>`max(${messagesTable.createdAt})`.as(
            "last_message_at",
          ),
        })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, normalizedConversationId))
        .limit(1)

      return {
        ...currentConversation,
        lastViewedAt: userState[0]?.lastViewedAt ?? null,
        lastMessageAt: lastMessage[0]?.lastMessageAt ?? null,
      }
    },
  )

const createConversation = base
  .input(
    z.object({
      name: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }): Promise<Conversation> => {
    const channelName = input.name.trim()
    if (!channelName) {
      throw new Error("Conversation name is required")
    }

    const conversation: Conversation = {
      id: generateId(),
      type: "channel",
      name: channelName,
      createdAt: new Date().toISOString(),
    }

    await context.db.insert(conversationsTable).values(conversation)
    broadcastWorkspaceUpdated(context)
    return conversation
  })

const deleteConversation = base
  .input(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }): Promise<void> => {
    const id = input.conversationId.trim()
    if (!id) {
      throw new Error("Conversation id is required")
    }

    const attachmentRows = await context.db
      .select({
        storageKey: messageAttachmentsTable.storageKey,
      })
      .from(messageAttachmentsTable)
      .innerJoin(
        messagesTable,
        eq(messageAttachmentsTable.messageId, messagesTable.id),
      )
      .where(eq(messagesTable.conversationId, id))

    await context.db
      .delete(messagesTable)
      .where(eq(messagesTable.conversationId, id))
    await context.db
      .delete(conversationUserStateTable)
      .where(eq(conversationUserStateTable.conversationId, id))
    await context.db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, id))
    await deleteBucketObjects(
      context,
      attachmentRows.map((attachment) => attachment.storageKey),
    )
    broadcastWorkspaceUpdated(context)
  })

const getMessages = base
  .input(
    z.object({
      conversationId: z.string(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
    }),
  )
  .handler(
    async ({
      context,
      input,
    }): Promise<{
      messages: Message[]
      nextCursor?: string
    }> => {
      const normalizedConversationId = input.conversationId.trim()
      const normalizedUserId = context.userId.trim()
      const limit = input.limit ?? 10
      const query = context.db
        .select()
        .from(messagesTable)
        .where(
          input.cursor
            ? and(
                eq(messagesTable.conversationId, normalizedConversationId),
                lt(messagesTable.createdAt, input.cursor),
              )
            : eq(messagesTable.conversationId, normalizedConversationId),
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(limit + 1)

      const messageRecords = await query
      const mostRecentMessageCreatedAt = input.cursor
        ? undefined
        : messageRecords[0]?.createdAt

      if (normalizedUserId && mostRecentMessageCreatedAt) {
        await markConversationAsViewed(
          context,
          normalizedConversationId,
          normalizedUserId,
          mostRecentMessageCreatedAt,
        )
      }

      let nextCursor: string | undefined
      if (messageRecords.length > limit) {
        const nextItem = messageRecords.pop()
        nextCursor = nextItem?.createdAt
      }

      const messages = await enrichMessages(context, messageRecords)

      return {
        messages,
        nextCursor,
      }
    },
  )

const sendMessage = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      content: z.string(),
      tiptapJson: z.string().nullable().optional(),
      attachments: z.array(AttachmentFileSchema),
    }),
  )
  .handler(async ({ context, input }): Promise<Message> =>
    createMessageInConversation(context, input),
  )

const getDirectConversationByMemberIds = base
  .input(DirectConversationMembersInputSchema)
  .handler(async ({ context, input }): Promise<Conversation | null> => {
    return findParticipantConversationByMemberIds(
      context,
      context.userId,
      input.memberIds,
    )
  })

const sendDirectMessage = base
  .input(
    DirectConversationMembersInputSchema.extend({
      conversationName: z.string().optional(),
      content: z.string(),
      tiptapJson: z.string().nullable().optional(),
      attachments: z.array(AttachmentFileSchema),
    }),
  )
  .handler(
    async ({
      context,
      input,
    }): Promise<{
      conversation: Conversation
      message: Message
      createdConversation: boolean
    }> => {
      let conversation = await findParticipantConversationByMemberIds(
        context,
        context.userId,
        input.memberIds,
      )
      let createdConversation = false

      if (!conversation) {
        conversation = await createDirectConversation(
          context,
          context.userId,
          input.memberIds,
          input.conversationName,
        )
        createdConversation = true
      }

      const message = await createMessageInConversation(context, {
        conversationId: conversation.id,
        content: input.content,
        tiptapJson: input.tiptapJson,
        attachments: input.attachments,
      })

      return {
        conversation,
        message,
        createdConversation,
      }
    },
  )

const getVapidPublicKey = base.handler(async ({ context }): Promise<string> => {
  return context.vapidDetails!.publicKey
})

const savePushSubscription = base
  .input(PushSubscriptionInputSchema)
  .handler(async ({ context, input }): Promise<void> => {
    const normalizedUserId = context.userId.trim()
    const endpoint = input.endpoint.trim()

    if (!normalizedUserId) {
      throw new Error("User id is required")
    }

    if (!endpoint) {
      throw new Error("Push subscription endpoint is required")
    }

    const now = new Date().toISOString()

    await context.db
      .insert(pushSubscriptionsTable)
      .values({
        endpoint,
        userId: normalizedUserId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          userId: normalizedUserId,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          updatedAt: now,
        },
      })
  })

const deletePushSubscription = base
  .input(
    z.object({
      endpoint: z.url(),
    }),
  )
  .handler(async ({ context, input }): Promise<void> => {
    const normalizedUserId = context.userId.trim()
    const normalizedEndpoint = input.endpoint.trim()

    if (!normalizedUserId || !normalizedEndpoint) {
      return
    }

    await context.db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, normalizedUserId),
          eq(pushSubscriptionsTable.endpoint, normalizedEndpoint),
        ),
      )
  })

async function enrichMessages(
  context: OrpcContext,
  messageRecords: MessageRecord[],
): Promise<Message[]> {
  const messageIds = messageRecords.map((message) => message.id)
  const attachmentsByMessageId = await listAttachmentsByMessageIds(
    context,
    messageIds,
  )
  const mentionsByMessageId = await listMentionsByMessageIds(
    context,
    messageIds,
  )

  return messageRecords.map((message) => ({
    ...message,
    attachments: attachmentsByMessageId.get(message.id) ?? [],
    mentions: mentionsByMessageId.get(message.id) ?? [],
  }))
}

async function listAttachmentsByMessageIds(
  context: OrpcContext,
  messageIds: string[],
): Promise<Map<string, MessageAttachment[]>> {
  if (messageIds.length === 0) {
    return new Map()
  }

  const attachments = await context.db
    .select()
    .from(messageAttachmentsTable)
    .where(inArray(messageAttachmentsTable.messageId, messageIds))
    .orderBy(
      asc(messageAttachmentsTable.createdAt),
      asc(messageAttachmentsTable.id),
    )

  const attachmentsByMessageId = new Map<string, MessageAttachment[]>()
  for (const attachment of attachments) {
    const existing = attachmentsByMessageId.get(attachment.messageId)
    if (existing) {
      existing.push(attachment)
    } else {
      attachmentsByMessageId.set(attachment.messageId, [attachment])
    }
  }

  return attachmentsByMessageId
}

async function listMentionsByMessageIds(
  context: OrpcContext,
  messageIds: string[],
): Promise<Map<string, MessageMention[]>> {
  if (messageIds.length === 0) {
    return new Map()
  }

  const mentions = await context.db
    .select()
    .from(messageMentionsTable)
    .where(inArray(messageMentionsTable.messageId, messageIds))
    .orderBy(asc(messageMentionsTable.createdAt), asc(messageMentionsTable.id))

  const mentionsByMessageId = new Map<string, MessageMention[]>()
  for (const mention of mentions) {
    const existing = mentionsByMessageId.get(mention.messageId)
    if (existing) {
      existing.push(mention)
    } else {
      mentionsByMessageId.set(mention.messageId, [mention])
    }
  }

  return mentionsByMessageId
}

function extractMessageMentions(
  tiptapJson: string | null | undefined,
  messageId: string,
  createdAt: string,
): MessageMention[] {
  if (!tiptapJson) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(tiptapJson)
  } catch {
    return []
  }

  const mentionedUserIds = new Set<string>()
  collectMentionedUserIds(parsed, mentionedUserIds)

  return Array.from(mentionedUserIds).map((mentionedUserId) => ({
    id: crypto.randomUUID(),
    messageId,
    type: "user",
    mentionedUserId,
    createdAt,
  }))
}

function collectMentionedUserIds(node: unknown, mentionedUserIds: Set<string>) {
  if (!node || typeof node !== "object") {
    return
  }

  const contentNode = node as {
    type?: unknown
    attrs?: { id?: unknown }
    content?: unknown
  }

  if (contentNode.type === "member-mention") {
    const mentionedUserId =
      typeof contentNode.attrs?.id === "string"
        ? contentNode.attrs.id.trim()
        : ""

    if (mentionedUserId) {
      mentionedUserIds.add(mentionedUserId)
    }
  }

  if (!Array.isArray(contentNode.content)) {
    return
  }

  for (const child of contentNode.content) {
    collectMentionedUserIds(child, mentionedUserIds)
  }
}

async function markConversationAsViewed(
  context: OrpcContext,
  conversationId: string,
  userId: string,
  mostRecentMessageCreatedAt: string,
): Promise<void> {
  const existingState = await context.db
    .select({
      lastViewedAt: conversationUserStateTable.lastViewedAt,
    })
    .from(conversationUserStateTable)
    .where(
      and(
        eq(conversationUserStateTable.conversationId, conversationId),
        eq(conversationUserStateTable.userId, userId),
      ),
    )
    .limit(1)

  const previousLastViewedAt = existingState[0]?.lastViewedAt
  if (
    previousLastViewedAt &&
    previousLastViewedAt > mostRecentMessageCreatedAt
  ) {
    return
  }

  const nextLastViewedAt = new Date().toISOString()

  if (previousLastViewedAt) {
    await context.db
      .update(conversationUserStateTable)
      .set({ lastViewedAt: nextLastViewedAt })
      .where(
        and(
          eq(conversationUserStateTable.conversationId, conversationId),
          eq(conversationUserStateTable.userId, userId),
        ),
      )
    return
  }

  await context.db.insert(conversationUserStateTable).values({
    id: `${userId}_${conversationId}`,
    userId,
    conversationId,
    lastViewedAt: nextLastViewedAt,
  })
}

function broadcastWorkspaceUpdated(context: OrpcContext): void {
  broadcastEvent(context, {
    type: "workspaceUpdated",
  })
}

function broadcastEvent(context: OrpcContext, event: ServerEvent): void {
  const payload = JSON.stringify(event)

  for (const ws of context.getWebSockets()) {
    ws.send(payload)
  }
}

async function sendPushNotifications(
  context: OrpcContext,
  message: Message,
): Promise<void> {
  const subscriptions = await listPushSubscriptions(context)
  if (subscriptions.length === 0) {
    return
  }

  const conversation = await context.db
    .select({
      name: conversationsTable.name,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, message.conversationId))
    .limit(1)

  const payload = buildPushNotificationPayload(
    message,
    conversation[0]?.name ?? null,
  )

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      sendPushNotification(context, subscription, payload),
    ),
  )
}

async function listPushSubscriptions(
  context: OrpcContext,
): Promise<PushSubscriptionRecord[]> {
  return context.db.select().from(pushSubscriptionsTable)
}

async function deleteBucketObjects(
  context: OrpcContext,
  storageKeys: string[],
): Promise<void> {
  if (storageKeys.length === 0) {
    return
  }

  await Promise.allSettled(
    storageKeys.map(async (storageKey) => {
      try {
        await context.env.MAIN_BUCKET.delete(storageKey)
      } catch (error) {
        console.error("[attachments] failed to delete object", {
          error,
          storageKey,
        })
      }
    }),
  )
}

async function sendPushNotification(
  context: OrpcContext,
  subscription: PushSubscriptionRecord,
  payload: ReturnType<typeof buildPushNotificationPayload>,
): Promise<void> {
  const requestDetails = createPushRequestDetails(
    context.vapidDetails!,
    subscription,
    payload,
  )

  try {
    const response = await fetch(requestDetails.endpoint, {
      method: requestDetails.method,
      headers: requestDetails.headers,
      body: requestDetails.body,
    })

    if (response.status === 404 || response.status === 410) {
      await deletePushSubscriptionByEndpoint(context, subscription.endpoint)
      console.warn("[push] removed expired subscription", {
        endpoint: subscription.endpoint,
        status: response.status,
      })
      return
    }

    if (!response.ok) {
      console.error("[push] unexpected push response", {
        endpoint: subscription.endpoint,
        status: response.status,
        body: await response.text().catch(() => ""),
      })
    }

    console.log("[push] push notification sent", {
      endpoint: subscription.endpoint,
      status: response.status,
      body: await response.text().catch(() => ""),
    })
  } catch (error) {
    console.error("[push] failed to send notification", {
      error,
      endpoint: subscription.endpoint,
    })
  }
}

async function deletePushSubscriptionByEndpoint(
  context: OrpcContext,
  endpoint: string,
): Promise<void> {
  const normalizedEndpoint = endpoint.trim()
  if (!normalizedEndpoint) {
    return
  }

  await context.db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, normalizedEndpoint))
}

function sanitizeAttachmentFileName(fileName: string): string {
  const normalized = fileName.trim() || "attachment"
  const sanitized = normalized
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return sanitized || "attachment"
}

function normalizeAttachmentContentType(contentType: string): string {
  const normalized = contentType.trim()
  return normalized || "application/octet-stream"
}

function normalizeDirectConversationMemberIds(
  memberIds: string[],
  currentUserId: string,
) {
  const normalizedUserId = currentUserId.trim()
  const normalizedSelectedMemberIds = Array.from(
    new Set(memberIds.map((memberId) => memberId.trim()).filter(Boolean)),
  ).sort()

  if (!normalizedUserId) {
    throw new Error("User id is required")
  }

  if (normalizedSelectedMemberIds.length === 0) {
    throw new Error("At least one member is required")
  }

  return Array.from(
    new Set([normalizedUserId, ...normalizedSelectedMemberIds]),
  ).sort()
}

function getParticipantConversationType(participantIds: string[]) {
  return participantIds.length > 2 ? "group" : "direct"
}

async function findParticipantConversationByMemberIds(
  context: OrpcContext,
  currentUserId: string,
  memberIds: string[],
): Promise<Conversation | null> {
  const normalizedCurrentUserId = currentUserId.trim()
  const participantIds = normalizeDirectConversationMemberIds(
    memberIds,
    normalizedCurrentUserId,
  )
  const conversationType = getParticipantConversationType(participantIds)

  const candidateConversationIds = await context.db
    .select({
      conversationId: conversationMembersTable.conversationId,
    })
    .from(conversationMembersTable)
    .innerJoin(
      conversationsTable,
      eq(conversationMembersTable.conversationId, conversationsTable.id),
    )
    .where(
      and(
        eq(conversationMembersTable.userId, normalizedCurrentUserId),
        eq(conversationsTable.type, conversationType),
      ),
    )

  const conversationIds = candidateConversationIds.map(
    (conversation) => conversation.conversationId,
  )

  if (conversationIds.length === 0) {
    return null
  }

  const memberRows = await context.db
    .select({
      id: conversationsTable.id,
      type: conversationsTable.type,
      name: conversationsTable.name,
      createdAt: conversationsTable.createdAt,
      userId: conversationMembersTable.userId,
    })
    .from(conversationsTable)
    .innerJoin(
      conversationMembersTable,
      eq(conversationsTable.id, conversationMembersTable.conversationId),
    )
    .where(
      and(
        eq(conversationsTable.type, conversationType),
        inArray(conversationsTable.id, conversationIds),
      ),
    )
    .orderBy(
      asc(conversationsTable.createdAt),
      asc(conversationMembersTable.userId),
    )

  const participantKey = participantIds.join("\u0000")
  const conversationsById = new Map<
    string,
    { conversation: Conversation; memberIds: string[] }
  >()

  for (const row of memberRows) {
    const existingConversation = conversationsById.get(row.id)

    if (existingConversation) {
      existingConversation.memberIds.push(row.userId)
      continue
    }

    conversationsById.set(row.id, {
      conversation: {
        id: row.id,
        type: row.type,
        name: row.name,
        createdAt: row.createdAt,
      },
      memberIds: [row.userId],
    })
  }

  for (const { conversation, memberIds: currentMemberIds } of conversationsById.values()) {
    if (currentMemberIds.slice().sort().join("\u0000") === participantKey) {
      return conversation
    }
  }

  return null
}

async function createDirectConversation(
  context: OrpcContext,
  currentUserId: string,
  memberIds: string[],
  conversationName?: string,
): Promise<Conversation> {
  const participantIds = normalizeDirectConversationMemberIds(
    memberIds,
    currentUserId,
  )
  const conversationType = getParticipantConversationType(participantIds)
  const createdAt = new Date().toISOString()
  const conversation: Conversation = {
    id: generateId(),
    type: conversationType,
    name: conversationName?.trim() || null,
    createdAt,
  }

  context.db.transaction((tx) => {
    tx.insert(conversationsTable).values(conversation).run()
    tx.insert(conversationMembersTable)
      .values(
        participantIds.map((userId) => ({
          id: `${userId}_${conversation.id}`,
          userId,
          conversationId: conversation.id,
          joinedAt: createdAt,
        })),
      )
      .run()
  })

  broadcastWorkspaceUpdated(context)

  return conversation
}

async function createMessageInConversation(
  context: OrpcContext,
  input: {
    conversationId: string
    content: string
    tiptapJson?: string | null
    attachments: File[]
  },
): Promise<Message> {
  const normalizedConversationId = input.conversationId.trim()
  const normalizedUserId = context.userId.trim()
  const trimmedContent = input.content.trim()
  const attachments = await Promise.all(
    input.attachments.map(
      async (attachment): Promise<AttachmentUploadInput> => ({
        fileName: attachment.name,
        contentType: attachment.type,
        sizeBytes: attachment.size,
        bytes: await attachment.arrayBuffer(),
      }),
    ),
  )

  if (!normalizedConversationId) {
    throw new Error("Conversation id is required")
  }

  if (!normalizedUserId) {
    throw new Error("User id is required")
  }

  if (!trimmedContent && attachments.length === 0) {
    throw new Error("Message content or attachments are required")
  }

  const createdAt = new Date().toISOString()
  const normalizedTiptapJson = normalizeTiptapJson(
    trimmedContent ? input.tiptapJson : null,
  )
  const messageRecord: MessageRecord = {
    id: crypto.randomUUID(),
    conversationId: normalizedConversationId,
    content: trimmedContent ? input.content : "",
    tiptapJson: normalizedTiptapJson,
    userId: normalizedUserId,
    createdAt,
  }
  const uploadedKeys: string[] = []
  const attachmentRecords: MessageAttachment[] = []
  const mentionRecords = extractMessageMentions(
    normalizedTiptapJson,
    messageRecord.id,
    createdAt,
  )

  try {
    for (const attachment of attachments) {
      const attachmentId = crypto.randomUUID()
      const contentType = normalizeAttachmentContentType(
        attachment.contentType,
      )
      const storageKey = `attachments/${attachmentId}-${sanitizeAttachmentFileName(
        attachment.fileName,
      )}`

      await context.env.MAIN_BUCKET.put(storageKey, attachment.bytes, {
        httpMetadata: {
          contentType,
        },
      })

      uploadedKeys.push(storageKey)
      attachmentRecords.push({
        id: attachmentId,
        messageId: messageRecord.id,
        userId: normalizedUserId,
        storageKey,
        fileName: attachment.fileName,
        contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt,
      })
    }

    context.db.transaction((tx) => {
      tx.insert(messagesTable).values(messageRecord).run()

      if (attachmentRecords.length > 0) {
        tx.insert(messageAttachmentsTable).values(attachmentRecords).run()
      }

      if (mentionRecords.length > 0) {
        tx.insert(messageMentionsTable).values(mentionRecords).run()
      }
    })
  } catch (error) {
    await deleteBucketObjects(context, uploadedKeys)
    throw error
  }

  const message: Message = {
    ...messageRecord,
    attachments: attachmentRecords,
    mentions: mentionRecords,
  }

  await markConversationAsViewed(
    context,
    normalizedConversationId,
    normalizedUserId,
    createdAt,
  )

  broadcastEvent(context, {
    type: "messageCreated",
    message,
  })
  context.waitUntil(sendPushNotifications(context, message))

  return message
}

export const orpcRouter = {
  getConversations,
  getConversationById,
  createConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  getDirectConversationByMemberIds,
  sendDirectMessage,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
}

export const orpcHandler = new RPCHandler(orpcRouter)
