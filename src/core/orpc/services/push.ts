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
  type PushSubscriptionRecord,
} from "../../schema"
import type { OrpcContext } from "../context"

async function listThreadParticipantUserIds(
  context: OrpcContext,
  message: EnrichedMessage,
): Promise<string[]> {
  const threadMessageId = message.threadRootMessageId ?? message.id
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
  const participantUserIds = await listThreadParticipantUserIds(
    context,
    message,
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
