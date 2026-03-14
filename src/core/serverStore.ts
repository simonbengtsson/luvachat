import type { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { generateId } from "./generateId"
import { conversationsTable, type Conversation } from "./schema"
import type { ClientEvent, ServerEvent } from "./sync-events"

type SyncDb = ReturnType<typeof drizzle>

export async function handleMessage(
  ctx: DurableObjectState,
  senderClientId: string,
  event: ClientEvent,
  getRecipientClientId: (ws: WebSocket) => string,
  db: SyncDb,
) {
  console.log("[sync] server received event", { senderClientId, event })

  if (event.type === "ping") {
    const outboundEvent: ServerEvent = {
      type: "pong",
      timestamp: new Date().toISOString(),
      fromClientId: senderClientId,
    }
    //broadcastEvent(ctx, senderClientId, outboundEvent, getRecipientClientId)
    return
  }

  if (event.type === "createConversation") {
    const name = event.name.trim()
    if (!name) {
      console.warn("[sync] refused createConversation with empty name", {
        senderClientId,
      })
      return
    }

    const conversation: Conversation = {
      id: generateId(),
      type: "channel",
      name,
      createdAt: new Date().toISOString(),
    }

    await db.insert(conversationsTable).values(conversation)

    const outboundEvent: ServerEvent = {
      type: "workspaceUpdated",
    }
    broadcastEvent(ctx, senderClientId, outboundEvent, getRecipientClientId)
    return
  }

  const _exhaustive: never = event
  console.warn("[sync] unhandled event", _exhaustive)
}

function sendEvent(
  ws: WebSocket,
  recipientClientId: string,
  event: ServerEvent,
) {
  console.log("[sync] server sending event", { recipientClientId, event })
  ws.send(JSON.stringify(event))
}

function broadcastEvent(
  ctx: DurableObjectState,
  senderClientId: string,
  event: ServerEvent,
  getRecipientClientId: (ws: WebSocket) => string,
): void {
  const sockets = ctx.getWebSockets()
  console.log("[sync] broadcasting event", {
    senderClientId,
    eventType: event.type,
    connectedClients: sockets.length,
  })

  for (const ws of sockets) {
    const recipientClientId = getRecipientClientId(ws)
    sendEvent(ws, recipientClientId, event)
  }
}
