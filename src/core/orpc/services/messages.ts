import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import {
  messageAttachmentsTable,
  messageMentionsTable,
  messagesTable,
  type EnrichedMessage,
  type MessageAttachment,
  type MessageMention,
  type MessageRecord,
} from "../../schema"
import type { OrpcContext } from "../context"
import { broadcastEvent } from "../realtime"
import { markConversationAsViewed } from "./conversations"
import { sendPushNotifications } from "./push"

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

async function enrichMessages(
  context: OrpcContext,
  messageRecords: MessageListRecord[],
): Promise<EnrichedMessage[]> {
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

export async function getMessagesForConversation(
  context: OrpcContext,
  input: {
    conversationId: string
    threadMessageId?: string
    cursor?: string
    limit?: number
  },
): Promise<{
  messages: EnrichedMessage[]
  nextCursor?: string
}> {
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
          input.cursor ? lt(messagesTable.createdAt, input.cursor) : undefined,
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
}

export async function createMessageInConversation(
  context: OrpcContext,
  input: {
    conversationId: string
    parentMessageId?: string
    content: string
    tiptapJson?: string | null
    attachments: File[]
  },
): Promise<EnrichedMessage> {
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

  const message: EnrichedMessage = {
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
