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
import type {
  EnrichedMessage,
  MessageSearchPage,
  MessageSearchResult,
  ThreadPage,
} from "../../models"
import {
  activityEventsTable,
  messageAttachmentsTable,
  messageMentionsTable,
  messageReactionsTable,
  messagesTable,
  threadMembersTable,
  type ActivityEvent,
  type Message,
  type MessageAttachment,
  type MessageMention,
  type MessageReaction,
} from "../../schema"
import type { OrpcContext } from "../context"
import { broadcastConversationEvent } from "../realtime"
import {
  markConversationAsViewed,
  requireConversationAccess,
} from "./conversations"
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

type ReactionSummary = EnrichedMessage["reactions"][number]
type MessageSearchRow = {
  messageId: string
  conversationId: string
  threadRootMessageId: string | null
  userId: string
  createdAt: string
  content: string
  contentPreview: string | null
}
const searchSnippetStartMarker = "__match_start__"
const searchSnippetEndMarker = "__match_end__"

function getMessageSearchPreview(
  content: string,
  contentPreview: string | null,
): string {
  if (contentPreview) {
    return contentPreview
  }

  if (content.length <= 160) {
    return content
  }

  return `${content.slice(0, 157)}...`
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

async function listReactionsByMessageIds(
  context: OrpcContext,
  messageIds: string[],
): Promise<Map<string, ReactionSummary[]>> {
  if (messageIds.length === 0) {
    return new Map()
  }

  const reactions = await context.db
    .select({
      messageId: messageReactionsTable.messageId,
      userId: messageReactionsTable.userId,
      emoji: messageReactionsTable.emoji,
      createdAt: messageReactionsTable.createdAt,
    })
    .from(messageReactionsTable)
    .where(inArray(messageReactionsTable.messageId, messageIds))
    .orderBy(
      asc(messageReactionsTable.createdAt),
      asc(messageReactionsTable.id),
    )

  const reactionsByMessageId = new Map<string, ReactionSummary[]>()
  const groupedReactionsByMessageId = new Map<
    string,
    Map<string, ReactionSummary>
  >()

  for (const reaction of reactions) {
    let groupedReactions = groupedReactionsByMessageId.get(reaction.messageId)
    let reactionSummaries = reactionsByMessageId.get(reaction.messageId)

    if (!groupedReactions || !reactionSummaries) {
      groupedReactions = new Map()
      reactionSummaries = []
      groupedReactionsByMessageId.set(reaction.messageId, groupedReactions)
      reactionsByMessageId.set(reaction.messageId, reactionSummaries)
    }

    const existingReaction = groupedReactions.get(reaction.emoji)
    if (existingReaction) {
      existingReaction.count += 1
      existingReaction.reactedByCurrentUser ||= reaction.userId === context.userId
      continue
    }

    const nextReaction = {
      emoji: reaction.emoji,
      count: 1,
      reactedByCurrentUser: reaction.userId === context.userId,
    }

    groupedReactions.set(reaction.emoji, nextReaction)
    reactionSummaries.push(nextReaction)
  }

  return reactionsByMessageId
}

function createThreadSummarySubquery(context: OrpcContext) {
  return context.db
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
  const reactionsByMessageId = await listReactionsByMessageIds(
    context,
    messageIds,
  )

  return messageRecords.map((message) => ({
    ...message,
    attachments: attachmentsByMessageId.get(message.id) ?? [],
    mentions: mentionsByMessageId.get(message.id) ?? [],
    reactions: reactionsByMessageId.get(message.id) ?? [],
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

function buildReactionActivityEvent(
  reactionRecord: MessageReaction,
  message: Message,
  actorUserId: string,
): ActivityEvent | null {
  if (message.userId === actorUserId) {
    return null
  }

  return {
    id: crypto.randomUUID(),
    userId: message.userId,
    type: "reaction",
    actorUserId,
    conversationId: message.conversationId,
    messageId: message.id,
    sourceType: "reaction",
    sourceId: reactionRecord.id,
    createdAt: reactionRecord.createdAt,
  }
}

async function getEnrichedMessageById(
  context: OrpcContext,
  messageId: string,
): Promise<EnrichedMessage | null> {
  const threadSummarySubquery = createThreadSummarySubquery(context)
  const messageRecords = await context.db
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
    .where(eq(messagesTable.id, messageId))
    .limit(1)

  const [message] = await enrichMessages(context, messageRecords)
  return message ?? null
}

export async function getLatestThreadMessageCreatedAt(
  context: OrpcContext,
  conversationId: string,
  threadRootMessageId: string,
): Promise<string | null> {
  await requireConversationAccess(context, conversationId)
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
  await requireConversationAccess(context, input.conversationId)
  const limit = input.limit ?? 10

  const threadSummarySubquery = createThreadSummarySubquery(context)

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
  const threadSummarySubquery = createThreadSummarySubquery(context)
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

export async function searchMessagesForUser(
  context: OrpcContext,
  input: {
    query: string
    conversationId?: string
    offset?: number
    limit?: number
  },
): Promise<MessageSearchPage> {
  const query = input.query.trim()
  if (!query) {
    return {
      results: [],
    }
  }

  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const conversationFilterClause = input.conversationId
    ? "and message_search.conversation_id = ?"
    : ""
  const queryParams = input.conversationId
    ? [context.userId, query, input.conversationId, limit + 1, offset]
    : [context.userId, query, limit + 1, offset]
  const rows = context.db.$client.sql
    .exec(
      `
        select
          message_search.message_id as messageId,
          message_search.conversation_id as conversationId,
          message_search.thread_root_message_id as threadRootMessageId,
          message_search.user_id as userId,
          message_search.created_at as createdAt,
          message_search.content,
          snippet(
            message_search,
            5,
            '${searchSnippetStartMarker}',
            '${searchSnippetEndMarker}',
            ' ... ',
            18
          ) as contentPreview,
          bm25(message_search) as rank
        from message_search
        inner join conversations
          on conversations.id = message_search.conversation_id
        left join conversation_members as current_user_conversation_membership
          on current_user_conversation_membership.conversation_id = message_search.conversation_id
         and current_user_conversation_membership.user_id = ?
        where message_search match ?
          and (
            conversations.type = 'channel'
            or current_user_conversation_membership.user_id is not null
          )
        ${conversationFilterClause}
        order by rank, message_search.created_at desc, message_search.message_id desc
        limit ? offset ?
      `,
      ...queryParams,
    )
    .toArray() as MessageSearchRow[]

  let nextOffset: number | undefined
  if (rows.length > limit) {
    rows.pop()
    nextOffset = offset + limit
  }

  const results: MessageSearchResult[] = rows.map((row) => ({
    messageId: row.messageId,
    conversationId: row.conversationId,
    threadRootMessageId: row.threadRootMessageId,
    userId: row.userId,
    createdAt: row.createdAt,
    contentPreview: getMessageSearchPreview(row.content, row.contentPreview),
  }))

  return {
    results,
    nextOffset,
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
  await requireConversationAccess(context, input.conversationId)
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
    reactions: [],
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

  await broadcastConversationEvent(context, input.conversationId, {
    type: "messageCreated",
    message,
  })
  context.waitUntil(sendPushNotifications(context, message))

  return message
}

export async function toggleReactionForMessage(
  context: OrpcContext,
  input: {
    messageId: string
    emoji: string
  },
): Promise<EnrichedMessage> {
  const messageRecord = await context.db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, input.messageId))
    .limit(1)
  const message = messageRecord[0]

  if (!message) {
    throw new Error("Message not found")
  }

  await requireConversationAccess(context, message.conversationId)

  const existingReactionRecord = await context.db
    .select()
    .from(messageReactionsTable)
    .where(
      and(
        eq(messageReactionsTable.messageId, input.messageId),
        eq(messageReactionsTable.userId, context.userId),
        eq(messageReactionsTable.emoji, input.emoji),
      ),
    )
    .limit(1)
  const existingReaction = existingReactionRecord[0]

  context.db.transaction((tx) => {
    if (existingReaction) {
      tx.delete(messageReactionsTable)
        .where(eq(messageReactionsTable.id, existingReaction.id))
        .run()

      tx.delete(activityEventsTable)
        .where(
          and(
            eq(activityEventsTable.sourceType, "reaction"),
            eq(activityEventsTable.sourceId, existingReaction.id),
          ),
        )
        .run()

      return
    }

    const reactionRecord: MessageReaction = {
      id: crypto.randomUUID(),
      messageId: message.id,
      userId: context.userId,
      emoji: input.emoji,
      createdAt: new Date().toISOString(),
    }
    const reactionActivityEvent = buildReactionActivityEvent(
      reactionRecord,
      message,
      context.userId,
    )

    tx.insert(messageReactionsTable).values(reactionRecord).run()

    if (reactionActivityEvent) {
      tx.insert(activityEventsTable).values(reactionActivityEvent).run()
    }
  })

  const updatedMessage = await getEnrichedMessageById(context, message.id)
  if (!updatedMessage) {
    throw new Error("Message not found")
  }

  await broadcastConversationEvent(context, message.conversationId, {
    type: "messageUpdated",
    message: updatedMessage,
  })

  return updatedMessage
}
