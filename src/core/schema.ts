import {
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"

export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // channel | direct | group
  name: text("name"),
  createdAt: text("created_at").notNull(),
})
export type Conversation = typeof conversationsTable.$inferSelect

export const conversationMembersTable = sqliteTable("conversation_members", {
  id: text("id").primaryKey(), // userId_conversationId
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  joinedAt: text("joined_at").notNull(),
})
export type ConversationMember = typeof conversationMembersTable.$inferSelect

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  parentMessageId: text("parent_message_id").references(
    (): AnySQLiteColumn => messagesTable.id,
    {
      onDelete: "cascade",
    },
  ),
  content: text("content").notNull(),
  tiptapJson: text("tiptap_json"),
  createdAt: text("created_at").notNull(),
  userId: text("user_id").notNull(),
})

export const messageAttachmentsTable = sqliteTable("message_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messagesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
})
export const messageMentionsTable = sqliteTable("message_mentions", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messagesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // user | everyone | here
  mentionedUserId: text("mentioned_user_id"),
  createdAt: text("created_at").notNull(),
})
export type MessageRecord = typeof messagesTable.$inferSelect

export type MessageAttachment = typeof messageAttachmentsTable.$inferSelect

export type MessageMention = typeof messageMentionsTable.$inferSelect

export type EnrichedMessage = MessageRecord & {
  attachments: MessageAttachment[]
  mentions: MessageMention[]
  threadReplyCount: number
  threadLastReplyAt: string | null
}

export const pushSubscriptionsTable = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})
export type PushSubscriptionRecord = typeof pushSubscriptionsTable.$inferSelect

export const conversationUserStateTable = sqliteTable(
  "conversation_user_state",
  {
    id: text("id").primaryKey(), // userId_conversationId
    userId: text("user_id").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id),
    lastViewedAt: text("last_viewed_at").notNull(),
  },
)
export type ChannelUserState = typeof conversationUserStateTable.$inferSelect

export type ConversationWithUserState = Conversation & {
  memberIds: string[]
  lastViewedAt: string | null
  lastMessageAt: string | null
}
