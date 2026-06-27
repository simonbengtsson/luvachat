import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import type { EnrichedMessage } from "../../models"
import {
  buildPushNotificationPayload,
  createPushRequestDetails,
} from "../../push-server"
import {
  conversationMembersTable,
  conversationsTable,
  messagesTable,
  pushSubscriptionsTable,
  type Conversation,
  type PushSubscriptionRecord,
} from "../../schema"
import type { OrpcContext } from "../context"

async function listThreadPushRecipientUserIds(
  context: OrpcContext,
  message: EnrichedMessage,
): Promise<string[]> {
  const threadMessageId = message.threadRootMessageId!
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
          eq(messagesTable.threadRootMessageId, threadMessageId),
        ),
        sql`${messagesTable.userId} <> ${message.userId}`,
      ),
    )
    .groupBy(messagesTable.userId)
    .orderBy(asc(messagesTable.userId))

  return participants.map((participant) => participant.userId)
}

async function listChannelPushRecipientUserIds(
  context: OrpcContext,
  message: EnrichedMessage,
): Promise<string[]> {
  const recipients = await context.db
    .select({
      userId: pushSubscriptionsTable.userId,
    })
    .from(pushSubscriptionsTable)
    .where(sql`${pushSubscriptionsTable.userId} <> ${message.userId}`)
    .groupBy(pushSubscriptionsTable.userId)
    .orderBy(asc(pushSubscriptionsTable.userId))

  return recipients.map((recipient) => recipient.userId)
}

async function listConversationMemberPushRecipientUserIds(
  context: OrpcContext,
  message: EnrichedMessage,
): Promise<string[]> {
  const recipients = await context.db
    .select({
      userId: conversationMembersTable.userId,
    })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, message.conversationId),
        sql`${conversationMembersTable.userId} <> ${message.userId}`,
      ),
    )
    .orderBy(asc(conversationMembersTable.userId))

  return recipients.map((recipient) => recipient.userId)
}

async function listPushRecipientUserIds(
  context: OrpcContext,
  message: EnrichedMessage,
  conversation: Conversation,
): Promise<string[]> {
  if (message.threadRootMessageId) {
    return listThreadPushRecipientUserIds(context, message)
  }

  if (conversation.type === "channel") {
    return listChannelPushRecipientUserIds(context, message)
  }

  return listConversationMemberPushRecipientUserIds(context, message)
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

async function listMutedConversationUserIds(
  context: OrpcContext,
  conversationId: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set()
  }

  const mutedMemberships = await context.db
    .select({
      userId: conversationMembersTable.userId,
    })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        inArray(conversationMembersTable.userId, userIds),
        eq(conversationMembersTable.notificationLevel, "muted"),
      ),
    )

  return new Set(mutedMemberships.map((membership) => membership.userId))
}

async function deletePushSubscriptionByEndpoint(
  context: OrpcContext,
  endpoint: string,
): Promise<void> {
  await context.db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
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
    throw new Error(`Failed to send push notification: ${response.status}`)
  }

  console.log("[push] push notification sent", {
    endpoint: subscription.endpoint,
    status: response.status,
    body: await response.text().catch(() => ""),
  })
}

export async function sendPushNotifications(
  context: OrpcContext,
  message: EnrichedMessage,
): Promise<void> {
  const conversation = await context.db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, message.conversationId))
    .limit(1)
  const currentConversation = conversation[0]
  if (!currentConversation) {
    return
  }

  const participantUserIds = await listPushRecipientUserIds(
    context,
    message,
    currentConversation,
  )
  const mutedUserIds = await listMutedConversationUserIds(
    context,
    message.conversationId,
    participantUserIds,
  )
  const enabledParticipantUserIds = participantUserIds.filter(
    (userId) => !mutedUserIds.has(userId),
  )
  const subscriptions = await listPushSubscriptionsByUserIds(
    context,
    enabledParticipantUserIds,
  )
  if (subscriptions.length === 0) {
    return
  }

  const payload = buildPushNotificationPayload(
    message,
    currentConversation.name,
  )

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      sendPushNotification(context, subscription, payload),
    ),
  )
}
