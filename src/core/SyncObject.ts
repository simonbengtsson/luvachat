import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"
import { generateVAPIDKeys } from "web-push"
import {
  createInternalErrorResponse,
  getRequestId,
  logRequestError,
  logRuntimeError,
  withRequestId,
} from "./error-reporting"
import { orpcHandler } from "./orpcFunctions"
import type { VapidDetails } from "./push-server"
import { kvTable } from "./schema"

const vapidDetailsKey = "vapidDetails"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>
  private vapidDetails: VapidDetails | null = null

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)

    this.db = drizzle(state.storage)

    state.blockConcurrencyWhile(async () => {
      try {
        await this.ensureVapidDetails(state.storage)
        await migrate(this.db, { migrations })
      } catch (error) {
        logRuntimeError("sync.constructor", error, {
          durableObject: "SyncObject",
        })
        throw error
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const requestWithId = withRequestId(request)
    const requestId = getRequestId(requestWithId)
    const userId = requestWithId.headers.get("x-user-id")!

    try {
      const rpcResponse = await orpcHandler.handle(requestWithId, {
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

      if (requestWithId.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket upgrade request", { status: 426 })
      }

      const [client, server] = Object.values(new WebSocketPair())
      server.serializeAttachment({
        userId,
        requestId,
        connectedOn: new Date().toISOString(),
      })
      this.ctx.acceptWebSocket(server, [userId])

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    } catch (error) {
      logRequestError("sync.fetch", requestWithId, error, {
        durableObject: "SyncObject",
        userId,
      })

      return createInternalErrorResponse(requestId)
    }
  }

  private async ensureVapidDetails(): Promise<void> {
    const existing = await this.getKvRecord<VapidDetails>(vapidDetailsKey)
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
    await this.saveKvRecord(vapidDetailsKey, newDetails)
    this.vapidDetails = newDetails
  }

  private async getKvRecord<T>(key: string): Promise<T | null> {
    const existingKvRecord = await this.db
      .select({
        value: kvTable.value,
      })
      .from(kvTable)
      .where(eq(kvTable.key, key))
      .limit(1)

    const existing = existingKvRecord[0]
    if (!existing) {
      return null
    }

    return JSON.parse(existing.value) as T
  }

  private async saveKvRecord(key: string, value: unknown): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .insert(kvTable)
      .values({
        key,
        value: JSON.stringify(value),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: kvTable.key,
        set: {
          value: JSON.stringify(value),
          updatedAt: now,
        },
      })
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
    const attachment = this.getAttachment(ws)

    logRuntimeError("sync.websocket", error, {
      durableObject: "SyncObject",
      userId: attachment?.userId,
      requestId: attachment?.requestId,
      connectedClients: this.ctx.getWebSockets().length,
    })
  }

  private getAttachment(
    ws: WebSocket,
  ): { requestId?: string; userId: string } | null {
    return ws.deserializeAttachment() as { requestId?: string; userId: string } | null
  }

  private getUserId(ws: WebSocket): string {
    const attachment = this.getAttachment(ws)
    return attachment?.userId ?? "<unknown user id>"
  }
}
