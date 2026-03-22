import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"

// Database schema
// - messages
// - message_attachments
// - message_mentions
// - message_reactions
// - activity_events
// - conversations
// - conversation_members
// - conversation_user_state
// - push_subscriptions

export type Message = typeof messagesTable.$inferSelect
export const messagesTable = sqliteTable(
  "messages",
  {
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
  },
  (table) => [
    index("messages_conversation_parent_created_at_idx").on(
      table.conversationId,
      table.parentMessageId,
      table.createdAt,
    ),
    index("messages_parent_created_at_idx").on(
      table.parentMessageId,
      table.createdAt,
    ),
  ],
)

export type MessageAttachment = typeof messageAttachmentsTable.$inferSelect
export const messageAttachmentsTable = sqliteTable(
  "message_attachments",
  {
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
  },
  (table) => [
    index("message_attachments_message_created_at_idx").on(
      table.messageId,
      table.createdAt,
    ),
  ],
)

export type Conversation = typeof conversationsTable.$inferSelect
export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // channel | direct | group
  name: text("name"),
  createdAt: text("created_at").notNull(),
})

export type ConversationMember = typeof conversationMembersTable.$inferSelect
export const conversationMembersTable = sqliteTable(
  "conversation_members",
  {
    id: text("id").primaryKey(), // userId_conversationId
    userId: text("user_id").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    index("conversation_members_conversation_user_idx").on(
      table.conversationId,
      table.userId,
    ),
    index("conversation_members_user_conversation_idx").on(
      table.userId,
      table.conversationId,
    ),
  ],
)

export type MessageMention = typeof messageMentionsTable.$inferSelect
export const messageMentionsTable = sqliteTable(
  "message_mentions",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // user | everyone | here
    mentionedUserId: text("mentioned_user_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("message_mentions_message_created_at_idx").on(
      table.messageId,
      table.createdAt,
    ),
    index("message_mentions_user_created_at_idx").on(
      table.mentionedUserId,
      table.createdAt,
    ),
  ],
)

export type MessageReaction = typeof messageReactionsTable.$inferSelect
export const messageReactionsTable = sqliteTable(
  "message_reactions",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("message_reactions_message_id_idx").on(table.messageId),
    uniqueIndex("message_reactions_message_user_emoji_idx").on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
  ],
)

export type ActivityEvent = typeof activityEventsTable.$inferSelect
export const activityEventsTable = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(), // mention | thread_reply | reaction
    actorUserId: text("actor_user_id").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id),
    messageId: text("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // mention | reply | reaction
    sourceId: text("source_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("activity_events_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("activity_events_message_id_idx").on(table.messageId),
    uniqueIndex("activity_events_user_source_idx").on(
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
  ],
)

export type PushSubscriptionRecord = typeof pushSubscriptionsTable.$inferSelect
export const pushSubscriptionsTable = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
)

export type ConversationUserState =
  typeof conversationUserStateTable.$inferSelect
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
  (table) => [
    index("conversation_user_state_conversation_user_idx").on(
      table.conversationId,
      table.userId,
    ),
  ],
)
