import { createSelectSchema } from "drizzle-orm/zod"
import { z } from "zod"
import {
  conversationsTable,
  messageAttachmentsTable,
  messageMentionsTable,
  messagesTable,
} from "./schema"

export const ConversationNotificationLevel = z.enum(["all", "muted"])
export type ConversationNotificationLevel = z.infer<
  typeof ConversationNotificationLevel
>

export type EnrichedConversation = z.infer<typeof EnrichedConversation>
export const EnrichedConversation = createSelectSchema(
  conversationsTable,
).extend({
  memberIds: z.array(z.string()),
  lastViewedAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  notificationLevel: ConversationNotificationLevel,
})

export type MessageReactionSummary = z.infer<typeof MessageReactionSummary>
export const MessageReactionSummary = z.object({
  emoji: z.string().min(1),
  count: z.number().int().positive(),
  reactedByCurrentUser: z.boolean(),
})

export type EnrichedMessage = z.infer<typeof EnrichedMessage>
export const EnrichedMessage = createSelectSchema(messagesTable).extend({
  attachments: z.array(createSelectSchema(messageAttachmentsTable)),
  mentions: z.array(createSelectSchema(messageMentionsTable)),
  reactions: z.array(MessageReactionSummary),
  threadReplyCount: z.number().int().nonnegative(),
  threadLastReplyAt: z.string().nullable(),
  threadIsUnread: z.boolean(),
})

export type ActivityFeedItem = z.infer<typeof ActivityFeedItem>
export const ActivityFeedItem = z.object({
  id: z.string().min(1),
  type: z.enum(["mention", "reaction"]),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  threadRootMessageId: z.string().nullable(),
  isUnread: z.boolean(),
  latestCreatedAt: z.string().min(1),
  latestActorUserId: z.string().min(1),
  actorUserIds: z.array(z.string().min(1)),
  eventCount: z.number().int().nonnegative(),
  previewText: z.string(),
  previewAttachmentCount: z.number().int().nonnegative(),
})

export type ActivityPage = z.infer<typeof ActivityPage>
export const ActivityPage = z.object({
  activity: z.array(ActivityFeedItem),
  nextCursor: z.string().optional(),
})

export type ThreadPage = z.infer<typeof ThreadPage>
export const ThreadPage = z.object({
  threads: z.array(EnrichedMessage),
  nextCursor: z.string().optional(),
})

export type MessageSearchResult = z.infer<typeof MessageSearchResult>
export const MessageSearchResult = z.object({
  messageId: z.string().min(1),
  conversationId: z.string().min(1),
  threadRootMessageId: z.string().nullable(),
  userId: z.string().min(1),
  createdAt: z.string().min(1),
  contentPreview: z.string(),
})

export type MessageSearchPage = z.infer<typeof MessageSearchPage>
export const MessageSearchPage = z.object({
  results: z.array(MessageSearchResult),
  nextOffset: z.number().int().nonnegative().optional(),
})
