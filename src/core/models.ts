import { createSelectSchema } from "drizzle-orm/zod"
import { z } from "zod"
import {
  conversationsTable,
  messageAttachmentsTable,
  messageMentionsTable,
  messagesTable,
} from "./schema"

export type EnrichedConversation = z.infer<typeof EnrichedConversation>
export const EnrichedConversation = createSelectSchema(
  conversationsTable,
).extend({
  memberIds: z.array(z.string()),
  lastViewedAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
})

export type EnrichedMessage = z.infer<typeof EnrichedMessage>
export const EnrichedMessage = createSelectSchema(messagesTable).extend({
  attachments: z.array(createSelectSchema(messageAttachmentsTable)),
  mentions: z.array(createSelectSchema(messageMentionsTable)),
  threadReplyCount: z.number().int().nonnegative(),
  threadLastReplyAt: z.string().nullable(),
})

export type ActivityFeedItem = z.infer<typeof ActivityFeedItem>
export const ActivityFeedItem = z.object({
  id: z.string().min(1),
  type: z.enum(["mention", "reaction", "thread_reply"]),
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
