import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import { generateId } from "../../generateId"
import type {
  ConversationNotificationLevel,
  EnrichedConversation,
} from "../../models"
import {
  conversationMembersTable,
  conversationsTable,
  messageAttachmentsTable,
  messagesTable,
  type Conversation,
} from "../../schema"
import type { OrpcContext } from "../context"
import { broadcastWorkspaceUpdated } from "../realtime"

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
    .where(isNull(messagesTable.threadRootMessageId))
    .groupBy(messagesTable.conversationId)
    .as("conversation_last_root_message")
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

type ConversationAccessRecord = {
  conversation: Conversation
  isMember: boolean
}

async function getConversationAccessRecord(
  context: OrpcContext,
  conversationId: string,
  userId: string,
): Promise<ConversationAccessRecord | null> {
  const currentUserConversationMembershipTable = alias(
    conversationMembersTable,
    "current_user_conversation_membership",
  )
  const rows = await context.db
    .select({
      id: conversationsTable.id,
      type: conversationsTable.type,
      name: conversationsTable.name,
      createdAt: conversationsTable.createdAt,
      isMember: sql<number>`case when ${currentUserConversationMembershipTable.id} is null then 0 else 1 end`.as(
        "is_member",
      ),
    })
    .from(conversationsTable)
    .leftJoin(
      currentUserConversationMembershipTable,
      and(
        eq(
          currentUserConversationMembershipTable.conversationId,
          conversationsTable.id,
        ),
        eq(currentUserConversationMembershipTable.userId, userId),
      ),
    )
    .where(eq(conversationsTable.id, conversationId))
    .limit(1)

  const record = rows[0]
  if (!record) {
    return null
  }

  return {
    conversation: {
      id: record.id,
      type: record.type,
      name: record.name,
      createdAt: record.createdAt,
    },
    isMember: Boolean(record.isMember),
  }
}

function hasConversationAccess(record: ConversationAccessRecord): boolean {
  return record.conversation.type === "channel" || record.isMember
}

export async function requireConversationAccess(
  context: OrpcContext,
  conversationId: string,
  userId: string = context.userId,
): Promise<Conversation> {
  const record = await getConversationAccessRecord(context, conversationId, userId)

  if (!record || !hasConversationAccess(record)) {
    throw new Error("Conversation not found")
  }

  return record.conversation
}

async function getConversationMemberForUser(
  context: OrpcContext,
  conversationId: string,
  userId: string,
) {
  return context.db
    .select({
      id: conversationMembersTable.id,
      lastViewedAt: conversationMembersTable.lastViewedAt,
      notificationLevel: conversationMembersTable.notificationLevel,
    })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, userId),
      ),
    )
    .limit(1)
}

async function upsertConversationMemberLastViewedAt(
  context: OrpcContext,
  conversationId: string,
  userId: string,
  lastViewedAt: string,
  existingMemberId?: string,
): Promise<void> {
  if (existingMemberId) {
    await context.db
      .update(conversationMembersTable)
      .set({ lastViewedAt })
      .where(eq(conversationMembersTable.id, existingMemberId))
    return
  }

  await context.db.insert(conversationMembersTable).values({
    id: `${userId}_${conversationId}`,
    userId,
    conversationId,
    joinedAt: lastViewedAt,
    lastViewedAt,
  })
}

export async function setConversationNotificationLevel(
  context: OrpcContext,
  conversationId: string,
  userId: string,
  notificationLevel: ConversationNotificationLevel,
): Promise<void> {
  await requireConversationAccess(context, conversationId, userId)
  const existingMember = (await getConversationMemberForUser(
    context,
    conversationId,
    userId,
  ))[0]

  if (existingMember?.id) {
    await context.db
      .update(conversationMembersTable)
      .set({ notificationLevel })
      .where(eq(conversationMembersTable.id, existingMember.id))
    return
  }

  await context.db.insert(conversationMembersTable).values({
    id: `${userId}_${conversationId}`,
    userId,
    conversationId,
    joinedAt: new Date().toISOString(),
    lastViewedAt: null,
    notificationLevel,
  })
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

export async function getConversationsForUser(
  context: OrpcContext,
): Promise<EnrichedConversation[]> {
  const conversationLastMessageSubquery =
    buildConversationLastRootMessageSubquery(context)
  const currentUserConversationMembershipTable = alias(
    conversationMembersTable,
    "current_user_conversation_membership",
  )
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
      isMember: currentUserConversationMembershipTable.id,
      lastViewedAt: currentUserConversationMembershipTable.lastViewedAt,
      lastMessageAt: conversationLastMessageSubquery.lastMessageAt,
      notificationLevel: sql<ConversationNotificationLevel>`coalesce(${currentUserConversationMembershipTable.notificationLevel}, 'all')`.as(
        "notification_level",
      ),
    })
    .from(conversationsTable)
    .leftJoin(
      conversationMembersSubquery,
      eq(conversationMembersSubquery.conversationId, conversationsTable.id),
    )
    .leftJoin(
      currentUserConversationMembershipTable,
      and(
        eq(
          currentUserConversationMembershipTable.conversationId,
          conversationsTable.id,
        ),
        eq(currentUserConversationMembershipTable.userId, context.userId),
      ),
    )
    .leftJoin(
      conversationLastMessageSubquery,
      eq(conversationLastMessageSubquery.conversationId, conversationsTable.id),
    )
    .where(
      sql`${conversationsTable.type} = 'channel' or ${currentUserConversationMembershipTable.id} is not null`,
    )
    .orderBy(desc(conversationsTable.createdAt))

  return conversations.map(({ isMember: _isMember, ...conversation }) => ({
    ...conversation,
    memberIds: parseConversationMemberIds(conversation.memberIds),
  }))
}

export async function getConversationByIdForUser(
  context: OrpcContext,
  conversationId: string,
): Promise<EnrichedConversation | null> {
  const accessRecord = await getConversationAccessRecord(
    context,
    conversationId,
    context.userId,
  )
  if (!accessRecord || !hasConversationAccess(accessRecord)) {
    return null
  }

  const currentUserConversationMembershipTable = alias(
    conversationMembersTable,
    "current_user_conversation_membership",
  )
  const conversation = await context.db
    .select({
      id: conversationsTable.id,
      type: conversationsTable.type,
      name: conversationsTable.name,
      createdAt: conversationsTable.createdAt,
      lastViewedAt: currentUserConversationMembershipTable.lastViewedAt,
      notificationLevel: sql<ConversationNotificationLevel>`coalesce(${currentUserConversationMembershipTable.notificationLevel}, 'all')`.as(
        "notification_level",
      ),
    })
    .from(conversationsTable)
    .leftJoin(
      currentUserConversationMembershipTable,
      and(
        eq(
          currentUserConversationMembershipTable.conversationId,
          conversationsTable.id,
        ),
        eq(currentUserConversationMembershipTable.userId, context.userId),
      ),
    )
    .where(eq(conversationsTable.id, conversationId))
    .limit(1)

  const currentConversation = conversation[0]
  if (!currentConversation) {
    return null
  }

  const lastMessage = await context.db
    .select({
      lastMessageAt: sql<string | null>`max(${messagesTable.createdAt})`.as(
        "last_message_at",
      ),
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        isNull(messagesTable.threadRootMessageId),
      ),
    )
    .limit(1)

  const memberIds = await context.db
    .select({
      userId: conversationMembersTable.userId,
    })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId))
    .orderBy(asc(conversationMembersTable.userId))

  return {
    ...currentConversation,
    memberIds: memberIds.map((member) => member.userId),
    lastMessageAt: lastMessage[0]?.lastMessageAt ?? null,
  }
}

export async function createConversation(
  context: OrpcContext,
  name: string,
): Promise<Conversation> {
  const channelName = name.trim()
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
}

export async function deleteConversation(
  context: OrpcContext,
  conversationId: string,
): Promise<void> {
  const conversation = await requireConversationAccess(context, conversationId)
  const memberIds =
    conversation.type === "channel"
      ? []
      : (
          await context.db
            .select({
              userId: conversationMembersTable.userId,
            })
            .from(conversationMembersTable)
            .where(eq(conversationMembersTable.conversationId, conversationId))
        ).map((member) => member.userId)
  const attachmentRows = await context.db
    .select({
      storageKey: messageAttachmentsTable.storageKey,
    })
    .from(messageAttachmentsTable)
    .innerJoin(
      messagesTable,
      eq(messageAttachmentsTable.messageId, messagesTable.id),
    )
    .where(eq(messagesTable.conversationId, conversationId))

  await context.db
    .delete(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
  await context.db
    .delete(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId))
  await context.db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
  await deleteBucketObjects(
    context,
    attachmentRows.map((attachment) => attachment.storageKey),
  )
  broadcastWorkspaceUpdated(
    context,
    conversation.type === "channel" ? undefined : memberIds,
  )
}

export async function getLatestRootMessageCreatedAt(
  context: OrpcContext,
  conversationId: string,
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
        isNull(messagesTable.threadRootMessageId),
      ),
    )
    .limit(1)

  return latestMessage[0]?.createdAt ?? null
}

export async function markConversationAsViewed(
  context: OrpcContext,
  conversationId: string,
  userId: string,
  mostRecentMessageCreatedAt: string,
): Promise<void> {
  await requireConversationAccess(context, conversationId, userId)
  const existingMember = (await getConversationMemberForUser(
    context,
    conversationId,
    userId,
  ))[0]
  const previousLastViewedAt = existingMember?.lastViewedAt
  if (
    previousLastViewedAt &&
    previousLastViewedAt > mostRecentMessageCreatedAt
  ) {
    return
  }

  await upsertConversationMemberLastViewedAt(
    context,
    conversationId,
    userId,
    new Date().toISOString(),
    existingMember?.id,
  )
}

export async function findParticipantConversationByMemberIds(
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

export async function createDirectConversation(
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

  await context.db.transaction(async (tx) => {
    await tx.insert(conversationsTable).values(conversation).run()
    await tx.insert(conversationMembersTable)
      .values(
        participantIds.map((userId) => ({
          id: `${userId}_${conversation.id}`,
          userId,
          conversationId: conversation.id,
          joinedAt: createdAt,
          lastViewedAt: null,
        })),
      )
      .run()
  })

  broadcastWorkspaceUpdated(context, participantIds)

  return conversation
}
