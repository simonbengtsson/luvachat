import { and, desc, eq, inArray, sql } from "drizzle-orm"
import type { ActivityFeedItem } from "../../models"
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

export async function getActivityForUser(
  context: OrpcContext,
): Promise<ActivityFeedItem[]> {
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
  const activityGroups = new Map<string, ActivityFeedItem>()

  for (const eventRecord of eventRecords) {
    const groupId = getActivityGroupId(eventRecord)
    const existingGroup = activityGroups.get(groupId)
    const isUnread = isUnreadActivityEvent(
      eventRecord,
      conversationLastViewedAtByConversationId,
      threadLastViewedAtByThreadRootMessageId,
    )

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

  return Array.from(activityGroups.values())
}
