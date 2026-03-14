import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
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
export const ConversationWithUserState = ConversationSchema.extend({
  lastViewedAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
})
export type ConversationWithUserState = z.infer<
  typeof ConversationWithUserState
>

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  content: text("content").notNull(),
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
export const MessageRecordSchema = createSelectSchema(messagesTable)
export type MessageRecord = z.infer<typeof MessageRecordSchema>

export const MessageAttachmentSchema = createSelectSchema(
  messageAttachmentsTable,
)
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>

export const MessageSchema = MessageRecordSchema.extend({
  attachments: z.array(MessageAttachmentSchema),
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
