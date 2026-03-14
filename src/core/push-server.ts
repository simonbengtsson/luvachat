import webpush from "web-push"
import type { Message, PushSubscriptionRecord } from "./schema"

const NOTIFICATION_BODY_MAX_LENGTH = 140

export type PushNotificationPayload = {
  title: string
  body: string
  conversationId: string
  url: string
  messageId: string
  userId: string
  createdAt: string
}

export type VapidDetails = {
  subject: string
  publicKey: string
  privateKey: string
}

type PushRequestDetails = {
  endpoint: string
  method: string
  headers: Record<string, string>
  body?: ArrayBuffer
}

export function buildPushNotificationPayload(
  message: Message,
  conversationName?: string | null,
): PushNotificationPayload {
  const title = `#${conversationName?.trim() || message.conversationId}`
  const body = truncateNotificationBody(message.content)

  return {
    title,
    body,
    conversationId: message.conversationId,
    url: `/c/${encodeURIComponent(message.conversationId)}`,
    messageId: message.id,
    userId: message.userId,
    createdAt: message.createdAt,
  }
}

export function createPushRequestDetails(
  vapidDetails: VapidDetails,
  subscription: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth">,
  payload: PushNotificationPayload,
): PushRequestDetails {
  const requestDetails = webpush.generateRequestDetails(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload),
    {
      TTL: 60,
      urgency: "high",
      topic: payload.messageId.slice(0, 32),
      vapidDetails,
    },
  )

  let body: ArrayBuffer | undefined
  if (requestDetails.body) {
    const bodyBytes = new Uint8Array(requestDetails.body.byteLength)
    bodyBytes.set(requestDetails.body, 0)
    body = bodyBytes.buffer
  }

  return {
    endpoint: requestDetails.endpoint,
    method: requestDetails.method,
    headers: Object.fromEntries(
      Object.entries(requestDetails.headers).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
    body,
  }
}

function truncateNotificationBody(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "New message"
  }

  if (normalized.length <= NOTIFICATION_BODY_MAX_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, NOTIFICATION_BODY_MAX_LENGTH - 1)}…`
}
