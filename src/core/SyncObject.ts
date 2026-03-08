import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"
import { handleMessage } from "./serverStore"
import { ClientEventSchema } from "./sync-events"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>
  private decoder = new TextDecoder()

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

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  webSocketMessage(_: WebSocket, message: string | ArrayBuffer): void {
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

    handleMessage(parsedEvent.data)
  }

  webSocketClose(_ws: WebSocket, code: number, reason: string): void {
    console.log("[sync] websocket closed", { code, reason })
  }

  webSocketError(_ws: WebSocket, error: unknown): void {
    console.error("[sync] websocket error", error)
  }
}
