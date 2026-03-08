import type { ClientEvent } from "./sync-events"

export async function handleMessage(event: ClientEvent) {
  console.log("[sync] server received event", event)
}
