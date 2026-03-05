import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
})

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id),
  content: text("content").notNull(),
})
