import type { InferSelectModel } from "drizzle-orm"
import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export const channelsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull().default("channel"), // channel, group, thread
  name: text("name"),
  createdAt: text("created_at").notNull(),
})

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channelsTable.id),
  content: text("content").notNull(),
  createdAt: text("date").notNull(),
})

export type Channel = InferSelectModel<typeof channelsTable>
export type Message = InferSelectModel<typeof messagesTable>
