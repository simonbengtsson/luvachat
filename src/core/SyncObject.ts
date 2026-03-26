import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"
import { generateVAPIDKeys } from "web-push"
import { orpcHandler } from "./orpcFunctions"
import type { VapidDetails } from "./push-server"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>
  private vapidDetails: VapidDetails | null = null

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)

    this.db = drizzle(state.storage)

    state.blockConcurrencyWhile(async () => {
      await this.ensureVapidDetails(state.storage)
      await migrate(this.db, { migrations })
    })
  }

  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get("x-user-id")!
    const rpcResponse = await orpcHandler.handle(request, {
      prefix: "/sync/orpc",
      context: {
        db: this.db,
        env: this.env,
        userId,
        vapidDetails: this.vapidDetails,
        getWebSockets: this.ctx.getWebSockets.bind(this.ctx),
        waitUntil: this.ctx.waitUntil.bind(this.ctx),
      },
    })
    if (rpcResponse.matched) {
      return rpcResponse.response
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade request", { status: 426 })
    }

    const [client, server] = Object.values(new WebSocketPair())
    server.serializeAttachment({
      userId,
      connectedOn: new Date().toISOString(),
    })
    this.ctx.acceptWebSocket(server, [userId])

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private async ensureVapidDetails(
    storage: DurableObjectStorage,
  ): Promise<void> {
    const existing = await storage.get<VapidDetails>("vapidDetails2")
    if (existing) {
      this.vapidDetails = existing
      return
    }

    const keys = generateVAPIDKeys()
    const newDetails = {
      subject: `mailto:luvachat-contact@luvabase.com`,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    }
    await storage.put("vapidDetails2", newDetails)
    this.vapidDetails = newDetails
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    console.log("[sync] websocket closed", {
      clientId: this.getUserId(ws),
      code,
      reason,
      connectedClients: this.ctx.getWebSockets().length,
    })
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error("[sync] websocket error", {
      clientId: this.getUserId(ws),
      error,
    })
  }

  private getUserId(ws: WebSocket): string {
    const attachment = ws.deserializeAttachment() as { userId: string } | null
    return attachment?.userId ?? "<unknown user id>"
  }
}
