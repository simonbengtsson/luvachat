import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { and, desc, eq, lt, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"
import { generateVAPIDKeys } from "web-push"
import { generateId } from "./generateId"
import { setLuvabaseDevEnvironment } from "./luvabase"
import {
  buildPushNotificationPayload,
  createPushRequestDetails,
  type VapidDetails,
} from "./push-server"
import {
  conversationUserStateTable,
  conversationsTable,
  messagesTable,
  pushSubscriptionsTable,
  type Conversation,
  type ConversationWithUserState,
  type Message,
  type PushSubscriptionInput,
  type PushSubscriptionRecord,
} from "./schema"
import { handleMessage } from "./serverStore"
import { ClientEventSchema, type ServerEvent } from "./sync-events"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>
  private decoder = new TextDecoder()
  private vapidDetails: VapidDetails | null = null

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)

    setLuvabaseDevEnvironment()

    this.db = drizzle(state.storage)

    state.blockConcurrencyWhile(async () => {
      await this.ensureVapidDetails(state.storage)
      await migrate(this.db, { migrations })
    })
  }

  fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade request", { status: 426 })
    }

    const url = new URL(request.url)
    const clientId =
      request.headers.get("x-luvabase-user-id")?.trim() ??
      url.searchParams.get("userId")?.trim()
    if (!clientId) {
      return new Response("Missing sync client id", { status: 400 })
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

  async getVapidPublicKey(): Promise<string> {
    return this.vapidDetails!.publicKey
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

  async getConversations(userId: string): Promise<ConversationWithUserState[]> {
    const normalizedUserId = userId.trim()
    const conversationLastMessageSubquery = this.db
      .select({
        conversationId: messagesTable.conversationId,
        lastMessageAt: sql<string>`max(${messagesTable.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(messagesTable)
      .groupBy(messagesTable.conversationId)
      .as("conversation_last_message")

    let result = await this.db
      .select({
        id: conversationsTable.id,
        type: conversationsTable.type,
        name: conversationsTable.name,
        createdAt: conversationsTable.createdAt,
        lastViewedAt: conversationUserStateTable.lastViewedAt,
        lastMessageAt: conversationLastMessageSubquery.lastMessageAt,
      })
      .from(conversationsTable)
      .leftJoin(
        conversationUserStateTable,
        and(
          eq(conversationUserStateTable.conversationId, conversationsTable.id),
          eq(conversationUserStateTable.userId, normalizedUserId),
        ),
      )
      .leftJoin(
        conversationLastMessageSubquery,
        eq(
          conversationLastMessageSubquery.conversationId,
          conversationsTable.id,
        ),
      )
      .orderBy(desc(conversationsTable.createdAt))

    // result = result.map((row) => ({
    //   ...row,
    //   lastViewedAt: new Date(0).toISOString(),
    // }))

    return result
  }

  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<ConversationWithUserState | null> {
    const normalizedConversationId = conversationId.trim()
    const normalizedUserId = userId.trim()

    if (!normalizedConversationId) {
      throw new Error("Conversation id is required")
    }

    const conversation = await this.db
      .select({
        id: conversationsTable.id,
        type: conversationsTable.type,
        name: conversationsTable.name,
        createdAt: conversationsTable.createdAt,
      })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, normalizedConversationId))
      .limit(1)

    const currentConversation = conversation[0]
    if (!currentConversation) {
      return null
    }

    const userState = normalizedUserId
      ? await this.db
          .select({
            lastViewedAt: conversationUserStateTable.lastViewedAt,
          })
          .from(conversationUserStateTable)
          .where(
            and(
              eq(
                conversationUserStateTable.conversationId,
                normalizedConversationId,
              ),
              eq(conversationUserStateTable.userId, normalizedUserId),
            ),
          )
          .limit(1)
      : []

    const lastMessage = await this.db
      .select({
        lastMessageAt: sql<string | null>`max(${messagesTable.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, normalizedConversationId))
      .limit(1)

    return {
      ...currentConversation,
      lastViewedAt: userState[0]?.lastViewedAt ?? null,
      lastMessageAt: lastMessage[0]?.lastMessageAt ?? null,
    }
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

  async deleteConversation(conversationId: string): Promise<void> {
    const id = conversationId.trim()
    if (!id) {
      throw new Error("Conversation id is required")
    }

    await this.db
      .delete(messagesTable)
      .where(eq(messagesTable.conversationId, id))
    await this.db
      .delete(conversationUserStateTable)
      .where(eq(conversationUserStateTable.conversationId, id))
    await this.db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, id))
    this.broadcastWorkspaceUpdated()
  }

  async getMessages(
    conversationId: string,
    limit: number = 10,
    cursor?: string,
    userId?: string,
  ): Promise<{ messages: Message[]; nextCursor?: string }> {
    const normalizedConversationId = conversationId.trim()
    const normalizedUserId = userId?.trim()
    const query = this.db
      .select()
      .from(messagesTable)
      .where(
        cursor
          ? and(
              eq(messagesTable.conversationId, normalizedConversationId),
              lt(messagesTable.createdAt, cursor),
            )
          : eq(messagesTable.conversationId, normalizedConversationId),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit + 1)

    const messages = await query
    const mostRecentMessageCreatedAt = cursor
      ? undefined
      : messages[0]?.createdAt

    if (normalizedUserId && mostRecentMessageCreatedAt) {
      await this.markConversationAsViewed(
        normalizedConversationId,
        normalizedUserId,
        mostRecentMessageCreatedAt,
      )
    }

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

  private async markConversationAsViewed(
    conversationId: string,
    userId: string,
    mostRecentMessageCreatedAt: string,
  ): Promise<void> {
    const existingState = await this.db
      .select({
        lastViewedAt: conversationUserStateTable.lastViewedAt,
      })
      .from(conversationUserStateTable)
      .where(
        and(
          eq(conversationUserStateTable.conversationId, conversationId),
          eq(conversationUserStateTable.userId, userId),
        ),
      )
      .limit(1)

    const previousLastViewedAt = existingState[0]?.lastViewedAt
    if (
      previousLastViewedAt &&
      previousLastViewedAt > mostRecentMessageCreatedAt
    ) {
      return
    }

    const nextLastViewedAt = new Date().toISOString()

    if (previousLastViewedAt) {
      await this.db
        .update(conversationUserStateTable)
        .set({ lastViewedAt: nextLastViewedAt })
        .where(
          and(
            eq(conversationUserStateTable.conversationId, conversationId),
            eq(conversationUserStateTable.userId, userId),
          ),
        )
      return
    }

    await this.db.insert(conversationUserStateTable).values({
      id: `${userId}_${conversationId}`,
      userId,
      conversationId,
      lastViewedAt: nextLastViewedAt,
    })
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
    this.broadcastEvent({
      type: "messageCreated",
      message,
    })
    this.ctx.waitUntil(this.sendPushNotifications(message))
    return message
  }

  async savePushSubscription(
    userId: string,
    subscription: PushSubscriptionInput,
  ): Promise<void> {
    const normalizedUserId = userId.trim()
    const endpoint = subscription.endpoint.trim()

    if (!normalizedUserId) {
      throw new Error("User id is required")
    }

    if (!endpoint) {
      throw new Error("Push subscription endpoint is required")
    }

    const now = new Date().toISOString()

    await this.db
      .insert(pushSubscriptionsTable)
      .values({
        endpoint,
        userId: normalizedUserId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          userId: normalizedUserId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updatedAt: now,
        },
      })
  }

  async deletePushSubscription(
    userId: string,
    endpoint: string,
  ): Promise<void> {
    const normalizedUserId = userId.trim()
    const normalizedEndpoint = endpoint.trim()

    if (!normalizedUserId || !normalizedEndpoint) {
      return
    }

    await this.db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, normalizedUserId),
          eq(pushSubscriptionsTable.endpoint, normalizedEndpoint),
        ),
      )
  }

  private broadcastWorkspaceUpdated(): void {
    this.broadcastEvent({
      type: "workspaceUpdated",
    })
  }

  private broadcastEvent(event: ServerEvent): void {
    const payload = JSON.stringify(event)

    for (const ws of this.ctx.getWebSockets()) {
      ws.send(payload)
    }
  }

  private async sendPushNotifications(message: Message): Promise<void> {
    const subscriptions = await this.listPushSubscriptions()
    if (subscriptions.length === 0) {
      return
    }

    const conversation = await this.db
      .select({
        name: conversationsTable.name,
      })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, message.conversationId))
      .limit(1)

    const payload = buildPushNotificationPayload(
      message,
      conversation[0]?.name ?? null,
    )

    await Promise.allSettled(
      subscriptions.map((subscription) =>
        this.sendPushNotification(subscription, payload),
      ),
    )
  }

  private async listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    return this.db.select().from(pushSubscriptionsTable)
  }

  private async sendPushNotification(
    subscription: PushSubscriptionRecord,
    payload: ReturnType<typeof buildPushNotificationPayload>,
  ): Promise<void> {
    const requestDetails = createPushRequestDetails(
      this.vapidDetails!,
      subscription,
      payload,
    )

    try {
      const response = await fetch(requestDetails.endpoint, {
        method: requestDetails.method,
        headers: requestDetails.headers,
        body: requestDetails.body,
      })

      if (response.status === 404 || response.status === 410) {
        await this.deletePushSubscriptionByEndpoint(subscription.endpoint)
        console.warn("[push] removed expired subscription", {
          endpoint: subscription.endpoint,
          status: response.status,
        })
        return
      }

      if (!response.ok) {
        console.error("[push] unexpected push response", {
          endpoint: subscription.endpoint,
          status: response.status,
          body: await response.text().catch(() => ""),
        })
      }

      console.log("[push] push notification sent", {
        endpoint: subscription.endpoint,
        status: response.status,
        body: await response.text().catch(() => ""),
      })
    } catch (error) {
      console.error("[push] failed to send notification", {
        error,
        endpoint: subscription.endpoint,
      })
    }
  }

  private async deletePushSubscriptionByEndpoint(
    endpoint: string,
  ): Promise<void> {
    const normalizedEndpoint = endpoint.trim()
    if (!normalizedEndpoint) {
      return
    }

    await this.db
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, normalizedEndpoint))
  }
}
