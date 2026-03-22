import type { ServerEvent } from "../sync-events"
import type { OrpcContext } from "./context"

export function broadcastWorkspaceUpdated(context: OrpcContext): void {
  broadcastEvent(context, {
    type: "workspaceUpdated",
  })
}

export function broadcastEvent(
  context: OrpcContext,
  event: ServerEvent,
): void {
  const payload = JSON.stringify(event)

  for (const ws of context.getWebSockets()) {
    ws.send(payload)
  }
}
