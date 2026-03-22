import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import {
  buildPushNotificationPayload,
  createPushRequestDetails,
} from "../../push-server"
import {
  conversationsTable,
  messagesTable,
  pushSubscriptionsTable,
  type EnrichedMessage,
  type PushSubscriptionRecord,
} from "../../schema"
import type { OrpcContext } from "../context"

async function listThreadParticipantUserIds(
  context: OrpcContext,
  message: EnrichedMessage,
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
