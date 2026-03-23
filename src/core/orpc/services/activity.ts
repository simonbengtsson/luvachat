import { and, desc, eq, inArray, sql } from "drizzle-orm"
import type { ActivityFeedItem, ActivityPage } from "../../models"
import {
  activityEventsTable,
  conversationMembersTable,
  messageAttachmentsTable,
  messagesTable,
  threadMembersTable,
  type ActivityEvent,
  type Message,
} from "../../schema"
import type { OrpcContext } from "../context"

type ActivityEventType = ActivityFeedItem["type"]
type ActivityGroupRecord = ActivityFeedItem & {
  latestEventId: string
}

type ActivityEventRecord = Pick<
  ActivityEvent,
  "id" | "type" | "actorUserId" | "conversationId" | "messageId" | "createdAt"
> &
  Pick<Message, "content" | "threadRootMessageId">

function truncatePreviewText(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ")

  if (normalized.length <= 140) {
    return normalized
  }

  return `${normalized.slice(0, 139)}…`
}

function getActivityGroupId(record: ActivityEventRecord) {
  if (record.type === "thread_reply") {
    return `thread:${record.threadRootMessageId ?? record.messageId}`
  }

  return `${record.type}:${record.messageId}`
}

async function listAttachmentCountsByMessageIds(
  context: OrpcContext,
  messageIds: string[],
) {
  if (messageIds.length === 0) {
    return new Map<string, number>()
  }

  const attachmentCounts = await context.db
    .select({
      messageId: messageAttachmentsTable.messageId,
      attachmentCount:
        sql<number>`cast(count(*) as integer)`.as("attachment_count"),
    })
    .from(messageAttachmentsTable)
    .where(inArray(messageAttachmentsTable.messageId, messageIds))
    .groupBy(messageAttachmentsTable.messageId)

  return new Map(
    attachmentCounts.map((attachmentCount) => [
      attachmentCount.messageId,
      attachmentCount.attachmentCount,
    ]),
  )
}

async function listConversationLastViewedAtByConversationIds(
  context: OrpcContext,
  conversationIds: string[],
) {
  if (conversationIds.length === 0) {
    return new Map<string, string | null>()
  }

  const memberships = await context.db
    .select({
      conversationId: conversationMembersTable.conversationId,
      lastViewedAt: conversationMembersTable.lastViewedAt,
    })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.userId, context.userId),
        inArray(conversationMembersTable.conversationId, conversationIds),
      ),
    )

  return new Map(
    memberships.map((membership) => [
      membership.conversationId,
      membership.lastViewedAt,
    ]),
  )
}

async function listThreadLastViewedAtByThreadRootMessageIds(
  context: OrpcContext,
  threadRootMessageIds: string[],
) {
  if (threadRootMessageIds.length === 0) {
    return new Map<string, string | null>()
  }

  const memberships = await context.db
    .select({
      threadRootMessageId: threadMembersTable.threadRootMessageId,
      lastViewedAt: threadMembersTable.lastViewedAt,
    })
    .from(threadMembersTable)
    .where(
      and(
        eq(threadMembersTable.userId, context.userId),
        inArray(threadMembersTable.threadRootMessageId, threadRootMessageIds),
      ),
    )

  return new Map(
    memberships.map((membership) => [
      membership.threadRootMessageId,
      membership.lastViewedAt,
    ]),
  )
}

function isUnreadActivityEvent(
  eventRecord: ActivityEventRecord,
  conversationLastViewedAtByConversationId: Map<string, string | null>,
  threadLastViewedAtByThreadRootMessageId: Map<string, string | null>,
) {
  if (eventRecord.threadRootMessageId) {
    const lastViewedAt = threadLastViewedAtByThreadRootMessageId.get(
      eventRecord.threadRootMessageId,
    )

    return !lastViewedAt || lastViewedAt < eventRecord.createdAt
  }

  const lastViewedAt = conversationLastViewedAtByConversationId.get(
    eventRecord.conversationId,
  )

  return !lastViewedAt || lastViewedAt < eventRecord.createdAt
}

function createActivityCursor(createdAt: string, eventId: string) {
  return JSON.stringify({ createdAt, eventId })
}

function parseActivityCursor(cursor?: string) {
  if (!cursor) {
    return null
  }

  try {
    const parsed = JSON.parse(cursor)

    if (
      typeof parsed?.createdAt === "string" &&
      typeof parsed?.eventId === "string"
    ) {
      return parsed as {
        createdAt: string
        eventId: string
      }
    }
  } catch {}

  return null
}

function getActivityPageStartIndex(
  activity: ActivityGroupRecord[],
  cursor?: string,
) {
  const parsedCursor = parseActivityCursor(cursor)
  if (!parsedCursor) {
    return 0
  }

  const exactMatchIndex = activity.findIndex(
    (activityItem) =>
      activityItem.latestCreatedAt === parsedCursor.createdAt &&
      activityItem.latestEventId === parsedCursor.eventId,
  )

  if (exactMatchIndex >= 0) {
    return exactMatchIndex + 1
  }

  const fallbackIndex = activity.findIndex(
    (activityItem) => activityItem.latestCreatedAt < parsedCursor.createdAt,
  )

  return fallbackIndex >= 0 ? fallbackIndex : activity.length
}

export async function getActivityForUser(
  context: OrpcContext,
  input: {
    cursor?: string
    limit?: number
    unreadOnly?: boolean
  } = {},
): Promise<ActivityPage> {
  const limit = input.limit ?? 20
  const eventRecords = await context.db
    .select({
      id: activityEventsTable.id,
      type: activityEventsTable.type,
      actorUserId: activityEventsTable.actorUserId,
      conversationId: activityEventsTable.conversationId,
      messageId: activityEventsTable.messageId,
      createdAt: activityEventsTable.createdAt,
      content: messagesTable.content,
      threadRootMessageId: messagesTable.threadRootMessageId,
    })
    .from(activityEventsTable)
    .innerJoin(messagesTable, eq(messagesTable.id, activityEventsTable.messageId))
    .where(eq(activityEventsTable.userId, context.userId))
    .orderBy(desc(activityEventsTable.createdAt), desc(activityEventsTable.id))

  const attachmentCountByMessageId = await listAttachmentCountsByMessageIds(
    context,
    Array.from(new Set(eventRecords.map((eventRecord) => eventRecord.messageId))),
  )
  const conversationLastViewedAtByConversationId =
    await listConversationLastViewedAtByConversationIds(
      context,
      Array.from(
        new Set(eventRecords.map((eventRecord) => eventRecord.conversationId)),
      ),
    )
  const threadLastViewedAtByThreadRootMessageId =
    await listThreadLastViewedAtByThreadRootMessageIds(
      context,
      Array.from(
        new Set(
          eventRecords
            .map((eventRecord) => eventRecord.threadRootMessageId)
            .filter(
              (threadRootMessageId): threadRootMessageId is string =>
                !!threadRootMessageId,
            ),
        ),
      ),
    )
  const activityGroups = new Map<string, ActivityGroupRecord>()

  for (const eventRecord of eventRecords) {
    const groupId = getActivityGroupId(eventRecord)
    const isUnread = isUnreadActivityEvent(
      eventRecord,
      conversationLastViewedAtByConversationId,
      threadLastViewedAtByThreadRootMessageId,
    )
    const existingGroup = activityGroups.get(groupId)

    if (existingGroup) {
      existingGroup.eventCount += 1
      existingGroup.isUnread ||= isUnread

      if (!existingGroup.actorUserIds.includes(eventRecord.actorUserId)) {
        existingGroup.actorUserIds.push(eventRecord.actorUserId)
      }

      continue
    }

    activityGroups.set(groupId, {
      id: groupId,
      type: eventRecord.type as ActivityEventType,
      conversationId: eventRecord.conversationId,
      messageId: eventRecord.messageId,
      latestEventId: eventRecord.id,
      threadRootMessageId:
        eventRecord.type === "thread_reply"
          ? (eventRecord.threadRootMessageId ?? eventRecord.messageId)
          : eventRecord.threadRootMessageId,
      isUnread,
      latestCreatedAt: eventRecord.createdAt,
      latestActorUserId: eventRecord.actorUserId,
      actorUserIds: [eventRecord.actorUserId],
      eventCount: 1,
      previewText: truncatePreviewText(eventRecord.content),
      previewAttachmentCount:
        attachmentCountByMessageId.get(eventRecord.messageId) ?? 0,
    })
  }

  const activity = Array.from(activityGroups.values()).filter(
    (activityItem) => !input.unreadOnly || activityItem.isUnread,
  )
  const startIndex = getActivityPageStartIndex(activity, input.cursor)
  const pageActivity = activity.slice(startIndex, startIndex + limit)
  const lastActivityItem = pageActivity.at(-1)
  const nextCursor =
    startIndex + pageActivity.length < activity.length && lastActivityItem
      ? createActivityCursor(
          lastActivityItem.latestCreatedAt,
          lastActivityItem.latestEventId,
        )
      : undefined

  return {
    activity: pageActivity.map(
      ({ latestEventId: _latestEventId, ...item }) => item,
    ),
    nextCursor,
  }
}
