import type { ServerEvent } from "./sync-events"

export function handleMessage(event: ServerEvent) {
  console.log("[sync] store received event", event)
}
