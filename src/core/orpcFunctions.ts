import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { and, desc, eq, sql } from "drizzle-orm"
import type { drizzle } from "drizzle-orm/durable-sqlite/driver"
import {
  conversationsTable,
  conversationUserStateTable,
  messagesTable,
} from "./schema"

const base = os.$context<{ db: ReturnType<typeof drizzle>; userId: string }>()

export const syncObjectRpcRouter = {
  getConversations: base.handler(async ({ context }) => {
    console.log("getConversations", context.userId)
    const conversationLastMessageSubquery = context.db
      .select({
        conversationId: messagesTable.conversationId,
        lastMessageAt: sql<string>`max(${messagesTable.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(messagesTable)
      .groupBy(messagesTable.conversationId)
      .as("conversation_last_message")

    let result = await context.db
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
          eq(conversationUserStateTable.userId, context.userId),
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

    return result
  }),
}

export const orpcHandler = new RPCHandler(syncObjectRpcRouter)
