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
