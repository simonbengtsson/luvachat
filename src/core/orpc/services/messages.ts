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
import type { EnrichedMessage, ThreadPage } from "../../models"
import {
  activityEventsTable,
  messageAttachmentsTable,
  messageMentionsTable,
  messagesTable,
  threadMembersTable,
  type ActivityEvent,
  type Message,
  type MessageAttachment,
  type MessageMention,
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

type MessageListRecord = Message & {
  threadReplyCount: number
  threadLastReplyAt: string | null
  threadIsUnread?: boolean | number
}

type ThreadListRecord = MessageListRecord & {
  threadActivityAt: string
}

function createThreadCursor(
  threadActivityAt: string,
  createdAt: string,
  threadRootMessageId: string,
) {
  return JSON.stringify({
    threadActivityAt,
    createdAt,
    threadRootMessageId,
  })
}

function parseThreadCursor(cursor?: string) {
  if (!cursor) {
    return null
  }

  try {
    const parsed = JSON.parse(cursor)

    if (
      typeof parsed?.threadActivityAt === "string" &&
      typeof parsed?.createdAt === "string" &&
      typeof parsed?.threadRootMessageId === "string"
    ) {
      return parsed as {
        threadActivityAt: string
        createdAt: string
        threadRootMessageId: string
      }
    }
  } catch {}

  return null
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
    threadIsUnread: Boolean(message.threadIsUnread),
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

function buildMentionActivityEvents(
  mentionRecords: MessageMention[],
  message: Message,
  actorUserId: string,
): ActivityEvent[] {
  return mentionRecords.flatMap((mentionRecord) => {
    if (!mentionRecord.mentionedUserId || mentionRecord.mentionedUserId === actorUserId) {
      return []
    }

    return [
      {
        id: crypto.randomUUID(),
        userId: mentionRecord.mentionedUserId,
        type: "mention",
        actorUserId,
        conversationId: message.conversationId,
        messageId: message.id,
        sourceType: "mention",
        sourceId: mentionRecord.id,
        createdAt: message.createdAt,
      },
    ]
  })
}

export async function getLatestThreadMessageCreatedAt(
  context: OrpcContext,
  conversationId: string,
  threadRootMessageId: string,
): Promise<string | null> {
  const latestMessage = await context.db
    .select({
      createdAt: sql<string | null>`max(${messagesTable.createdAt})`.as(
        "created_at",
      ),
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        or(
          eq(messagesTable.id, threadRootMessageId),
          eq(messagesTable.threadRootMessageId, threadRootMessageId),
        ),
      ),
    )
    .limit(1)

  return latestMessage[0]?.createdAt ?? null
}

export async function markThreadAsViewed(
  context: OrpcContext,
  conversationId: string,
  threadRootMessageId: string,
  userId: string,
  mostRecentMessageCreatedAt: string,
): Promise<void> {
  const existingState = await context.db
    .select({
      lastViewedAt: threadMembersTable.lastViewedAt,
    })
    .from(threadMembersTable)
    .where(eq(threadMembersTable.id, `${userId}_${threadRootMessageId}`))
    .limit(1)

  const previousLastViewedAt = existingState[0]?.lastViewedAt
  if (
    previousLastViewedAt &&
    previousLastViewedAt > mostRecentMessageCreatedAt
  ) {
    return
  }

  const nextLastViewedAt = new Date().toISOString()

  if (existingState[0]) {
    await context.db
      .update(threadMembersTable)
      .set({ lastViewedAt: nextLastViewedAt })
      .where(eq(threadMembersTable.id, `${userId}_${threadRootMessageId}`))
    return
  }

  await context.db.insert(threadMembersTable).values({
    id: `${userId}_${threadRootMessageId}`,
    userId,
    conversationId,
    threadRootMessageId,
    joinedAt: nextLastViewedAt,
    lastViewedAt: nextLastViewedAt,
  })
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
      threadRootMessageId: messagesTable.threadRootMessageId,
      threadReplyCount: sql<number>`count(*)`.as("thread_reply_count"),
      threadLastReplyAt: sql<string>`max(${messagesTable.createdAt})`.as(
        "thread_last_reply_at",
      ),
    })
    .from(messagesTable)
    .where(isNotNull(messagesTable.threadRootMessageId))
    .groupBy(messagesTable.threadRootMessageId)
    .as("message_thread_summary")

  let nextCursor: string | undefined
  let messageRecords: MessageListRecord[]

  if (input.threadMessageId) {
    messageRecords = await context.db
      .select({
        id: messagesTable.id,
        conversationId: messagesTable.conversationId,
        threadRootMessageId: messagesTable.threadRootMessageId,
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
        eq(threadSummarySubquery.threadRootMessageId, messagesTable.id),
      )
      .where(
        and(
          eq(messagesTable.conversationId, input.conversationId),
          or(
            eq(messagesTable.id, input.threadMessageId),
            eq(messagesTable.threadRootMessageId, input.threadMessageId),
          ),
        ),
      )
      .orderBy(desc(messagesTable.createdAt))
  } else {
    messageRecords = await context.db
      .select({
        id: messagesTable.id,
        conversationId: messagesTable.conversationId,
        threadRootMessageId: messagesTable.threadRootMessageId,
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
        eq(threadSummarySubquery.threadRootMessageId, messagesTable.id),
      )
      .where(
        and(
          eq(messagesTable.conversationId, input.conversationId),
          isNull(messagesTable.threadRootMessageId),
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

  const messages = await enrichMessages(context, messageRecords)

  return {
    messages,
    nextCursor,
  }
}

export async function getThreadsForUser(
  context: OrpcContext,
  input: {
    cursor?: string
    limit?: number
    unreadOnly?: boolean
  } = {},
): Promise<ThreadPage> {
  const limit = input.limit ?? 20
  const threadSummarySubquery = context.db
    .select({
      threadRootMessageId: messagesTable.threadRootMessageId,
      threadReplyCount: sql<number>`count(*)`.as("thread_reply_count"),
      threadLastReplyAt: sql<string>`max(${messagesTable.createdAt})`.as(
        "thread_last_reply_at",
      ),
    })
    .from(messagesTable)
    .where(isNotNull(messagesTable.threadRootMessageId))
    .groupBy(messagesTable.threadRootMessageId)
    .as("message_thread_summary")
  const threadActivityAtSql = sql<string>`coalesce(${threadSummarySubquery.threadLastReplyAt}, ${messagesTable.createdAt})`
  const threadIsUnreadSql = sql<number>`
    case
      when ${threadMembersTable.lastViewedAt} is null then 1
      when ${threadMembersTable.lastViewedAt} < ${threadActivityAtSql} then 1
      else 0
    end
  `
  const parsedCursor = parseThreadCursor(input.cursor)

  const threadRecords = await context.db
    .select({
      id: messagesTable.id,
      conversationId: messagesTable.conversationId,
      threadRootMessageId: messagesTable.threadRootMessageId,
      content: messagesTable.content,
      tiptapJson: messagesTable.tiptapJson,
      createdAt: messagesTable.createdAt,
      userId: messagesTable.userId,
      threadReplyCount:
        sql<number>`coalesce(${threadSummarySubquery.threadReplyCount}, 0)`.as(
          "thread_reply_count",
        ),
      threadLastReplyAt: threadSummarySubquery.threadLastReplyAt,
      threadIsUnread: threadIsUnreadSql.as("thread_is_unread"),
      threadActivityAt: threadActivityAtSql.as("thread_activity_at"),
    })
    .from(threadMembersTable)
    .innerJoin(
      messagesTable,
      eq(messagesTable.id, threadMembersTable.threadRootMessageId),
    )
    .leftJoin(
      threadSummarySubquery,
      eq(threadSummarySubquery.threadRootMessageId, messagesTable.id),
    )
    .where(
      and(
        eq(threadMembersTable.userId, context.userId),
        input.unreadOnly ? sql`${threadIsUnreadSql} = 1` : undefined,
        parsedCursor
          ? or(
              sql`${threadActivityAtSql} < ${parsedCursor.threadActivityAt}`,
              and(
                sql`${threadActivityAtSql} = ${parsedCursor.threadActivityAt}`,
                lt(messagesTable.createdAt, parsedCursor.createdAt),
              ),
              and(
                sql`${threadActivityAtSql} = ${parsedCursor.threadActivityAt}`,
                eq(messagesTable.createdAt, parsedCursor.createdAt),
                lt(messagesTable.id, parsedCursor.threadRootMessageId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      desc(threadActivityAtSql),
      desc(messagesTable.createdAt),
      desc(messagesTable.id),
    )
    .limit(limit + 1)

  let nextCursor: string | undefined
  if (threadRecords.length > limit) {
    threadRecords.pop()
    const lastThread = threadRecords.at(-1) as ThreadListRecord | undefined
    nextCursor = lastThread
      ? createThreadCursor(
          lastThread.threadActivityAt,
          lastThread.createdAt,
          lastThread.id,
        )
      : undefined
  }

  return {
    threads: await enrichMessages(context, threadRecords),
    nextCursor,
  }
}

export async function createMessageInConversation(
  context: OrpcContext,
  input: {
    conversationId: string
    threadRootMessageId?: string
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
  let threadRootMessageId: string | null = null
  let threadRootMessageUserId: string | null = null

  if (input.threadRootMessageId) {
    const threadRootMessage = await context.db
      .select({
        id: messagesTable.id,
        conversationId: messagesTable.conversationId,
        threadRootMessageId: messagesTable.threadRootMessageId,
        userId: messagesTable.userId,
      })
      .from(messagesTable)
      .where(eq(messagesTable.id, input.threadRootMessageId))
      .limit(1)

    if (threadRootMessage[0]?.conversationId !== input.conversationId) {
      throw new Error("Thread message is invalid")
    }

    if (threadRootMessage[0].threadRootMessageId) {
      throw new Error("Nested threads are not allowed")
    }

    threadRootMessageId = threadRootMessage[0].id
    threadRootMessageUserId = threadRootMessage[0].userId
  }

  const messageRecord: Message = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    threadRootMessageId,
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
  const activityEventRecords = buildMentionActivityEvents(
    mentionRecords,
    messageRecord,
    context.userId,
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

      if (threadRootMessageId && threadRootMessageUserId) {
        tx.insert(threadMembersTable)
          .values({
            id: `${threadRootMessageUserId}_${threadRootMessageId}`,
            userId: threadRootMessageUserId,
            conversationId: input.conversationId,
            threadRootMessageId,
            joinedAt: createdAt,
            lastViewedAt: null,
          })
          .onConflictDoNothing()
          .run()
      }

      if (attachmentRecords.length > 0) {
        tx.insert(messageAttachmentsTable).values(attachmentRecords).run()
      }

      if (mentionRecords.length > 0) {
        tx.insert(messageMentionsTable).values(mentionRecords).run()
      }

      if (activityEventRecords.length > 0) {
        tx.insert(activityEventsTable).values(activityEventRecords).run()
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
    threadIsUnread: false,
  }

  if (threadRootMessageId) {
    await markThreadAsViewed(
      context,
      input.conversationId,
      threadRootMessageId,
      context.userId,
      createdAt,
    )
  } else {
    await markConversationAsViewed(
      context,
      input.conversationId,
      context.userId,
      createdAt,
    )
  }

  broadcastEvent(context, {
    type: "messageCreated",
    message,
  })
  context.waitUntil(sendPushNotifications(context, message))

  return message
}
