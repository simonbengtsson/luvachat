import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { createSelectSchema } from "drizzle-orm/zod"
import { z } from "zod"

export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name"),
  createdAt: text("created_at").notNull(),
})
export const ConversationSchema = createSelectSchema(conversationsTable)
export type Conversation = z.infer<typeof ConversationSchema>

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
  authorId: text("author_id").notNull(),
})
export const MessageSchema = createSelectSchema(messagesTable)
export type Message = z.infer<typeof MessageSchema>
