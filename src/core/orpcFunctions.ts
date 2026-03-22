import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm"
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

type MessageListRecord = MessageRecord & {
  threadReplyCount: number
  threadLastReplyAt: string | null
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
const conversationMemberIdsSeparator = "\u0000"

function parseConversationMemberIds(memberIds: string | null) {
  if (!memberIds) {
    return []
  }

  return memberIds.split(conversationMemberIdsSeparator).filter(Boolean)
}

function buildConversationLastRootMessageSubquery(context: OrpcContext) {
  return context.db
    .select({
      conversationId: messagesTable.conversationId,
      lastMessageAt: sql<string>`max(${messagesTable.createdAt})`.as(
        "last_message_at",
      ),
    })
    .from(messagesTable)
    .where(isNull(messagesTable.parentMessageId))
    .groupBy(messagesTable.conversationId)
    .as("conversation_last_root_message")
}

const getConversations = base.handler(
  async ({ context }): Promise<ConversationWithUserState[]> => {
    const conversationLastMessageSubquery =
      buildConversationLastRootMessageSubquery(context)
    const conversationMembersSubquery = context.db
      .select({
        conversationId: conversationMembersTable.conversationId,
        memberIds: sql<
          string | null
        >`group_concat(${conversationMembersTable.userId}, ${conversationMemberIdsSeparator})`.as(
          "member_ids",
        ),
      })
      .from(conversationMembersTable)
      .groupBy(conversationMembersTable.conversationId)
      .as("conversation_members")

    const conversations = await context.db
      .select({
        id: conversationsTable.id,
        type: conversationsTable.type,
        name: conversationsTable.name,
        createdAt: conversationsTable.createdAt,
        memberIds: conversationMembersSubquery.memberIds,
        lastViewedAt: conversationUserStateTable.lastViewedAt,
        lastMessageAt: conversationLastMessageSubquery.lastMessageAt,
      })
      .from(conversationsTable)
      .leftJoin(
        conversationMembersSubquery,
        eq(conversationMembersSubquery.conversationId, conversationsTable.id),
      )
      .leftJoin(
        conversationUserStateTable,
        and(
          eq(conversationUserStateTable.conversationId, conversationsTable.id),
          eq(conversationUserStateTable.userId, context.userId),
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

    return conversations.map((conversation) => ({
      ...conversation,
      memberIds: parseConversationMemberIds(conversation.memberIds),
    }))
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
      const conversation = await context.db
        .select({
          id: conversationsTable.id,
          type: conversationsTable.type,
          name: conversationsTable.name,
          createdAt: conversationsTable.createdAt,
        })
        .from(conversationsTable)
        .where(eq(conversationsTable.id, input.conversationId))
        .limit(1)

      const currentConversation = conversation[0]
      if (!currentConversation) {
        return null
      }

      const userState = await context.db
        .select({
          lastViewedAt: conversationUserStateTable.lastViewedAt,
        })
        .from(conversationUserStateTable)
        .where(
          and(
            eq(conversationUserStateTable.conversationId, input.conversationId),
            eq(conversationUserStateTable.userId, context.userId),
          ),
        )
        .limit(1)

      const lastMessage = await context.db
        .select({
          lastMessageAt: sql<string | null>`max(${messagesTable.createdAt})`.as(
            "last_message_at",
          ),
        })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, input.conversationId),
            isNull(messagesTable.parentMessageId),
          ),
        )
        .limit(1)
      const memberIds = await context.db
        .select({
          userId: conversationMembersTable.userId,
        })
        .from(conversationMembersTable)
        .where(eq(conversationMembersTable.conversationId, input.conversationId))
        .orderBy(asc(conversationMembersTable.userId))

      return {
        ...currentConversation,
        memberIds: memberIds.map((member) => member.userId),
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
    const attachmentRows = await context.db
      .select({
        storageKey: messageAttachmentsTable.storageKey,
      })
      .from(messageAttachmentsTable)
      .innerJoin(
        messagesTable,
        eq(messageAttachmentsTable.messageId, messagesTable.id),
      )
      .where(eq(messagesTable.conversationId, input.conversationId))

    await context.db
      .delete(messagesTable)
      .where(eq(messagesTable.conversationId, input.conversationId))
    await context.db
      .delete(conversationUserStateTable)
      .where(eq(conversationUserStateTable.conversationId, input.conversationId))
    await context.db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, input.conversationId))
    await deleteBucketObjects(
      context,
      attachmentRows.map((attachment) => attachment.storageKey),
    )
    broadcastWorkspaceUpdated(context)
  })

const getMessages = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      threadMessageId: z.string().min(1).optional(),
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
      const limit = input.limit ?? 10

      const threadSummarySubquery = context.db
        .select({
          parentMessageId: messagesTable.parentMessageId,
          threadReplyCount: sql<number>`count(*)`.as("thread_reply_count"),
          threadLastReplyAt: sql<string>`max(${messagesTable.createdAt})`.as(
            "thread_last_reply_at",
          ),
        })
        .from(messagesTable)
        .where(isNotNull(messagesTable.parentMessageId))
        .groupBy(messagesTable.parentMessageId)
        .as("message_thread_summary")

      let nextCursor: string | undefined
      let messageRecords: MessageListRecord[]

      if (input.threadMessageId) {
        messageRecords = await context.db
          .select({
            id: messagesTable.id,
            conversationId: messagesTable.conversationId,
            parentMessageId: messagesTable.parentMessageId,
            content: messagesTable.content,
            tiptapJson: messagesTable.tiptapJson,
            createdAt: messagesTable.createdAt,
            userId: messagesTable.userId,
            threadReplyCount:
              sql<number>`coalesce(${threadSummarySubquery.threadReplyCount}, 0)`.as(
                "thread_reply_count",
              ),
            threadLastReplyAt: threadSummarySubquery.threadLastReplyAt,
          })
          .from(messagesTable)
          .leftJoin(
            threadSummarySubquery,
            eq(threadSummarySubquery.parentMessageId, messagesTable.id),
          )
          .where(
            and(
              eq(messagesTable.conversationId, input.conversationId),
              or(
                eq(messagesTable.id, input.threadMessageId),
                eq(messagesTable.parentMessageId, input.threadMessageId),
              ),
            ),
          )
          .orderBy(desc(messagesTable.createdAt))
      } else {
        messageRecords = await context.db
          .select({
            id: messagesTable.id,
            conversationId: messagesTable.conversationId,
            parentMessageId: messagesTable.parentMessageId,
            content: messagesTable.content,
            tiptapJson: messagesTable.tiptapJson,
            createdAt: messagesTable.createdAt,
            userId: messagesTable.userId,
            threadReplyCount:
              sql<number>`coalesce(${threadSummarySubquery.threadReplyCount}, 0)`.as(
                "thread_reply_count",
              ),
            threadLastReplyAt: threadSummarySubquery.threadLastReplyAt,
          })
          .from(messagesTable)
          .leftJoin(
            threadSummarySubquery,
            eq(threadSummarySubquery.parentMessageId, messagesTable.id),
          )
          .where(
            and(
              eq(messagesTable.conversationId, input.conversationId),
              isNull(messagesTable.parentMessageId),
              input.cursor
                ? lt(messagesTable.createdAt, input.cursor)
                : undefined,
            ),
          )
          .orderBy(desc(messagesTable.createdAt))
          .limit(limit + 1)

        if (messageRecords.length > limit) {
          const nextItem = messageRecords.pop()
          nextCursor = nextItem?.createdAt
        }
      }

      const mostRecentMessageCreatedAt = input.cursor
        ? undefined
        : messageRecords[0]?.createdAt

      if (mostRecentMessageCreatedAt) {
        await markConversationAsViewed(
          context,
          input.conversationId,
          context.userId,
          mostRecentMessageCreatedAt,
        )
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
      parentMessageId: z.string().optional(),
      content: z.string(),
      tiptapJson: z.string().nullable().optional(),
      attachments: z.array(AttachmentFileSchema),
    }),
  )
  .handler(
    async ({ context, input }): Promise<Message> =>
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

const markConversationViewed = base
  .input(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }): Promise<void> => {
    const latestMessage = await context.db
      .select({
        createdAt: sql<string | null>`max(${messagesTable.createdAt})`.as(
          "created_at",
        ),
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, input.conversationId),
          isNull(messagesTable.parentMessageId),
        ),
      )
      .limit(1)

    const latestMessageCreatedAt = latestMessage[0]?.createdAt
    if (!latestMessageCreatedAt) {
      return
    }

    await markConversationAsViewed(
      context,
      input.conversationId,
      context.userId,
      latestMessageCreatedAt,
    )
  })

const getVapidPublicKey = base.handler(async ({ context }): Promise<string> => {
  return context.vapidDetails!.publicKey
})

const savePushSubscription = base
  .input(PushSubscriptionInputSchema)
  .handler(async ({ context, input }): Promise<void> => {
    const now = new Date().toISOString()

    await context.db
      .insert(pushSubscriptionsTable)
      .values({
        endpoint: input.endpoint,
        userId: context.userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          userId: context.userId,
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
    await context.db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, context.userId),
          eq(pushSubscriptionsTable.endpoint, input.endpoint),
        ),
      )
  })

async function enrichMessages(
  context: OrpcContext,
  messageRecords: MessageListRecord[],
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
      typeof contentNode.attrs?.id === "string" ? contentNode.attrs.id : ""

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
  const participantUserIds = await listThreadParticipantUserIds(
    context,
    message,
  )
  const subscriptions = await listPushSubscriptionsByUserIds(
    context,
    participantUserIds,
  )
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

async function listThreadParticipantUserIds(
  context: OrpcContext,
  message: Message,
): Promise<string[]> {
  const threadMessageId = message.parentMessageId ?? message.id
  const participants = await context.db
    .select({
      userId: messagesTable.userId,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, message.conversationId),
        or(
          eq(messagesTable.id, threadMessageId),
          eq(messagesTable.parentMessageId, threadMessageId),
        ),
        sql`${messagesTable.userId} <> ${message.userId}`,
      ),
    )
    .groupBy(messagesTable.userId)
    .orderBy(asc(messagesTable.userId))

  return participants.map((participant) => participant.userId)
}

async function listPushSubscriptionsByUserIds(
  context: OrpcContext,
  userIds: string[],
): Promise<PushSubscriptionRecord[]> {
  if (userIds.length === 0) {
    return []
  }

  return context.db
    .select()
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, userIds))
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
  await context.db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
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
  return Array.from(new Set([currentUserId, ...memberIds])).sort()
}

function getParticipantConversationType(participantIds: string[]) {
  return participantIds.length > 2 ? "group" : "direct"
}

async function findParticipantConversationByMemberIds(
  context: OrpcContext,
  currentUserId: string,
  memberIds: string[],
): Promise<Conversation | null> {
  const participantIds = normalizeDirectConversationMemberIds(
    memberIds,
    currentUserId,
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
        eq(conversationMembersTable.userId, currentUserId),
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

  for (const {
    conversation,
    memberIds: currentMemberIds,
  } of conversationsById.values()) {
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
    parentMessageId?: string
    content: string
    tiptapJson?: string | null
    attachments: File[]
  },
): Promise<Message> {
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

  if (!trimmedContent && attachments.length === 0) {
    throw new Error("Message content or attachments are required")
  }

  const createdAt = new Date().toISOString()
  const normalizedTiptapJson = normalizeTiptapJson(
    trimmedContent ? input.tiptapJson : null,
  )
  let parentMessageId: string | null = null

  if (input.parentMessageId) {
    const parentMessage = await context.db
      .select({
        id: messagesTable.id,
        conversationId: messagesTable.conversationId,
        parentMessageId: messagesTable.parentMessageId,
      })
      .from(messagesTable)
      .where(eq(messagesTable.id, input.parentMessageId))
      .limit(1)

    if (parentMessage[0]?.conversationId !== input.conversationId) {
      throw new Error("Thread message is invalid")
    }

    if (parentMessage[0].parentMessageId) {
      throw new Error("Nested threads are not allowed")
    }

    parentMessageId = parentMessage[0].id
  }

  const messageRecord: MessageRecord = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    parentMessageId,
    content: trimmedContent ? input.content : "",
    tiptapJson: normalizedTiptapJson,
    userId: context.userId,
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
      const contentType = normalizeAttachmentContentType(attachment.contentType)
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
        userId: context.userId,
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
    threadReplyCount: 0,
    threadLastReplyAt: null,
  }

  await markConversationAsViewed(
    context,
    input.conversationId,
    context.userId,
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
  markConversationViewed,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
}

export const orpcHandler = new RPCHandler(orpcRouter)
