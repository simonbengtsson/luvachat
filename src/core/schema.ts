import {
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"
import { createSelectSchema } from "drizzle-orm/zod"
import { z } from "zod"

export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // channel | direct | group
  name: text("name"),
  createdAt: text("created_at").notNull(),
})
export const ConversationSchema = createSelectSchema(conversationsTable)
export type Conversation = z.infer<typeof ConversationSchema>
export const ConversationWithUserState = ConversationSchema.extend({
  memberIds: z.array(z.string()),
  lastViewedAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
})
export type ConversationWithUserState = z.infer<
  typeof ConversationWithUserState
>

export const conversationMembersTable = sqliteTable("conversation_members", {
  id: text("id").primaryKey(), // userId_conversationId
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  joinedAt: text("joined_at").notNull(),
})
export const ConversationMemberSchema = createSelectSchema(
  conversationMembersTable,
)
export type ConversationMember = z.infer<typeof ConversationMemberSchema>

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
export const MessageRecordSchema = createSelectSchema(messagesTable)
export type MessageRecord = z.infer<typeof MessageRecordSchema>

export const MessageAttachmentSchema = createSelectSchema(
  messageAttachmentsTable,
)
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>

export const MessageMentionSchema = createSelectSchema(messageMentionsTable)
export type MessageMention = z.infer<typeof MessageMentionSchema>

export const MessageSchema = MessageRecordSchema.extend({
  attachments: z.array(MessageAttachmentSchema),
  mentions: z.array(MessageMentionSchema),
  threadReplyCount: z.number().int().nonnegative().default(0),
  threadLastReplyAt: z.string().nullable().default(null),
})
export type Message = z.infer<typeof MessageSchema>

export const pushSubscriptionsTable = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})
export const PushSubscriptionRecordSchema = createSelectSchema(
  pushSubscriptionsTable,
)
export type PushSubscriptionRecord = z.infer<
  typeof PushSubscriptionRecordSchema
>

export const PushSubscriptionInputSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>

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
export const ChannelUserStateSchema = createSelectSchema(
  conversationUserStateTable,
)
export type ChannelUserState = z.infer<typeof ChannelUserStateSchema>
