import type { InferSelectModel } from "drizzle-orm"
import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name"),
  createdAt: text("created_at").notNull(),
})

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
  authorId: text("author_id").notNull(),
})

export type ConversationRow = InferSelectModel<typeof conversationsTable>
export type MessageRow = InferSelectModel<typeof messagesTable>
