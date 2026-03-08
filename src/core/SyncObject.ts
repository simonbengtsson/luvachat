import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"
import { handleMessage } from "./serverStore"
import { ClientEventSchema } from "./sync-events"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>
  private decoder = new TextDecoder()
  private clientIds = new Map<WebSocket, string>()

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)

    this.db = drizzle(state.storage)

    state.blockConcurrencyWhile(async () => {
      await migrate(this.db, { migrations })
    })
  }

  fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade request", { status: 426 })
    }

    const clientId = request.headers.get("x-luvabase-user-id")?.trim()
    if (!clientId) {
      return new Response("Missing x-luvabase-user-id header", { status: 400 })
    }

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    this.clientIds.set(server, clientId)

    console.log("[sync] websocket connected", {
      clientId,
      connectedClients: this.ctx.getWebSockets().length,
    })

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const rawMessage =
      typeof message === "string" ? message : this.decoder.decode(message)
    let payload: unknown

    try {
      payload = JSON.parse(rawMessage)
    } catch {
      console.warn("[sync] received invalid event payload", rawMessage)
      return
    }

    const parsedEvent = ClientEventSchema.safeParse(payload)
    if (!parsedEvent.success) {
      console.warn("[sync] received invalid event payload", payload)
      return
    }

    handleMessage(this.ctx, this.getClientId(ws), parsedEvent.data, (recipientWs) =>
      this.getClientId(recipientWs),
    )
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const clientId = this.getClientId(ws)
    this.clientIds.delete(ws)

    console.log("[sync] websocket closed", {
      clientId,
      code,
      reason,
      connectedClients: this.ctx.getWebSockets().length,
    })
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error("[sync] websocket error", {
      clientId: this.getClientId(ws),
      error,
    })
  }

  private getClientId(ws: WebSocket): string {
    return this.clientIds.get(ws) ?? "unknown"
  }
}
