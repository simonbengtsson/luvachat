import type { ClientEvent, ServerEvent } from "./sync-events"

export function handleMessage(
  ctx: DurableObjectState,
  senderClientId: string,
  event: ClientEvent,
  getRecipientClientId: (ws: WebSocket) => string,
) {
  console.log("[sync] server received event", { senderClientId, event })

  if (event.type === "ping") {
    const outboundEvent: ServerEvent = {
      type: "pong",
      timestamp: new Date().toISOString(),
      fromClientId: senderClientId,
    }

    const sockets = ctx.getWebSockets()
    console.log("[sync] broadcasting pong", {
      senderClientId,
      connectedClients: sockets.length,
    })

    for (const ws of sockets) {
      const recipientClientId = getRecipientClientId(ws)
      sendEvent(ws, recipientClientId, outboundEvent)
    }
  } else {
    console.warn("[sync] unhandled event type", event.type)
  }
}

function sendEvent(
  ws: WebSocket,
  recipientClientId: string,
  event: ServerEvent,
) {
  console.log("[sync] server sending event", { recipientClientId, event })
  ws.send(JSON.stringify(event))
}
