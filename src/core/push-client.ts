import {
  deletePushSubscription,
  getPushPublicKey,
  savePushSubscription,
} from "./functions"
import type { PushSubscriptionInput } from "./schema"

export const PUSH_SERVICE_WORKER_PATH = "/push-sw.js"

export function supportsPushNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  )
}

export async function syncPushSubscription(): Promise<PushSubscription | null> {
  if (!supportsPushNotifications() || Notification.permission !== "granted") {
    return null
  }

  const registration = await navigator.serviceWorker.register(
    PUSH_SERVICE_WORKER_PATH,
    { scope: "/" },
  )
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    const { publicKey } = await getPushPublicKey()
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    })
  }

  await savePushSubscription({
    data: serializePushSubscription(subscription),
  })

  return subscription
}

export async function cleanupPushSubscription(): Promise<void> {
  if (!supportsPushNotifications()) {
    return
  }

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()

  if (!subscription) {
    return
  }

  try {
    await deletePushSubscription({
      data: {
        endpoint: subscription.endpoint,
      },
    })
  } catch (error) {
    console.error("Failed to delete stored push subscription:", error)
  }

  try {
    await subscription.unsubscribe()
  } catch (error) {
    console.error("Failed to unsubscribe push subscription:", error)
  }
}

function serializePushSubscription(
  subscription: PushSubscription,
): PushSubscriptionInput {
  const json = subscription.toJSON()
  const endpoint = json.endpoint ?? subscription.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing endpoint or encryption keys.")
  }

  return {
    endpoint,
    expirationTime: json.expirationTime ?? subscription.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  }
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output.buffer
}
