import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { and, desc, eq, lt } from "drizzle-orm"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"
import { generateId } from "./generateId"
import { setLuvabaseDevEnvironment } from "./luvabase"
import {
  conversationsTable,
  messagesTable,
  type Conversation,
  type Message,
} from "./schema"
import { handleMessage } from "./serverStore"
import { ClientEventSchema } from "./sync-events"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>
  private decoder = new TextDecoder()

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)

    setLuvabaseDevEnvironment()

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
    this.ctx.acceptWebSocket(server, [clientId])

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

    this.ctx.waitUntil(
      handleMessage(
        this.ctx,
        this.getClientId(ws),
        parsedEvent.data,
        (recipientWs) => this.getClientId(recipientWs),
        this.db,
      ),
    )
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    console.log("[sync] websocket closed", {
      clientId: this.getClientId(ws),
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
    const [id] = this.ctx.getTags(ws)
    return id ?? "unknown"
  }

  async getConversations(): Promise<Conversation[]> {
    return this.db
      .select({
        id: conversationsTable.id,
        type: conversationsTable.type,
        name: conversationsTable.name,
        createdAt: conversationsTable.createdAt,
      })
      .from(conversationsTable)
      .orderBy(desc(conversationsTable.createdAt))
  }

  async createConversation(name: string): Promise<Conversation> {
    const channelName = name.trim()
    if (!channelName) {
      throw new Error("Conversation name is required")
    }

    const conversation: Conversation = {
      id: generateId(),
      type: "channel",
      name: channelName,
      createdAt: new Date().toISOString(),
    }

    await this.db.insert(conversationsTable).values(conversation)
    this.broadcastWorkspaceUpdated()
    return conversation
  }

  async getMessages(
    conversationId: string,
    limit: number = 10,
    cursor?: string,
  ): Promise<{ messages: Message[]; nextCursor?: string }> {
    const query = this.db
      .select()
      .from(messagesTable)
      .where(
        cursor
          ? and(
              eq(messagesTable.conversationId, conversationId),
              lt(messagesTable.createdAt, cursor),
            )
          : eq(messagesTable.conversationId, conversationId),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit + 1)

    const messages = await query

    let nextCursor: string | undefined
    if (messages.length > limit) {
      const nextItem = messages.pop()
      nextCursor = nextItem?.createdAt
    }

    return {
      messages, // Keep newest first within each page
      nextCursor,
    }
  }

  async sendMessage(
    conversationId: string,
    content: string,
    authorId: string,
  ): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      conversationId,
      content,
      authorId,
      createdAt: new Date().toISOString(),
    }

    await this.db.insert(messagesTable).values(message)
    return message
  }

  private broadcastWorkspaceUpdated(): void {
    const payload = JSON.stringify({
      type: "workspaceUpdated",
    })

    for (const ws of this.ctx.getWebSockets()) {
      ws.send(payload)
    }
  }
}
