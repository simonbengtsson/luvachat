import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { generateId } from "../../generateId"
import type { ConversationWithUserState } from "../../models"
import {
  conversationMembersTable,
  conversationUserStateTable,
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
    .where(isNull(messagesTable.parentMessageId))
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
): Promise<ConversationWithUserState[]> {
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
      eq(conversationLastMessageSubquery.conversationId, conversationsTable.id),
    )
    .orderBy(desc(conversationsTable.createdAt))

  return conversations.map((conversation) => ({
    ...conversation,
    memberIds: parseConversationMemberIds(conversation.memberIds),
  }))
}

export async function getConversationByIdForUser(
  context: OrpcContext,
  conversationId: string,
): Promise<ConversationWithUserState | null> {
  const conversation = await context.db
    .select({
      id: conversationsTable.id,
      type: conversationsTable.type,
      name: conversationsTable.name,
      createdAt: conversationsTable.createdAt,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
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
        eq(conversationUserStateTable.conversationId, conversationId),
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
        eq(messagesTable.conversationId, conversationId),
        isNull(messagesTable.parentMessageId),
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
    lastViewedAt: userState[0]?.lastViewedAt ?? null,
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
  const attachmentRows = await context.db
    .select({
      storageKey: messageAttachmentsTable.storageKey,
    })
    .from(messageAttachmentsTable)
    .innerJoin(messagesTable, eq(messageAttachmentsTable.messageId, messagesTable.id))
    .where(eq(messagesTable.conversationId, conversationId))

  await context.db
    .delete(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
  await context.db
    .delete(conversationUserStateTable)
    .where(eq(conversationUserStateTable.conversationId, conversationId))
  await context.db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
  await deleteBucketObjects(
    context,
    attachmentRows.map((attachment) => attachment.storageKey),
  )
  broadcastWorkspaceUpdated(context)
}

export async function getLatestRootMessageCreatedAt(
  context: OrpcContext,
  conversationId: string,
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
        isNull(messagesTable.parentMessageId),
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
