import { z } from "zod"
import type {
  Conversation as ConversationRow,
  Message as MessageRow,
  MessageAttachment as MessageAttachmentRow,
  MessageMention as MessageMentionRow,
} from "./schema"

export const MessageAttachmentSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  userId: z.string(),
  storageKey: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.string(),
}) satisfies z.ZodType<MessageAttachmentRow>

export const MessageMentionSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  type: z.string(),
  mentionedUserId: z.string().nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<MessageMentionRow>

export const ConversationWithUserStateSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().nullable(),
  createdAt: z.string(),
  memberIds: z.array(z.string()),
  lastViewedAt: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
}) satisfies z.ZodType<
  ConversationRow & {
    memberIds: string[]
    lastViewedAt: string | null
    lastMessageAt: string | null
  }
>

export type ConversationWithUserState = z.infer<
  typeof ConversationWithUserStateSchema
>

export const EnrichedMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  parentMessageId: z.string().nullable(),
  content: z.string(),
  tiptapJson: z.string().nullable(),
  createdAt: z.string(),
  userId: z.string(),
  attachments: z.array(MessageAttachmentSchema),
  mentions: z.array(MessageMentionSchema),
  threadReplyCount: z.number().int().nonnegative(),
  threadLastReplyAt: z.string().nullable(),
}) satisfies z.ZodType<
  MessageRow & {
    attachments: MessageAttachmentRow[]
    mentions: MessageMentionRow[]
    threadReplyCount: number
    threadLastReplyAt: string | null
  }
>

export type EnrichedMessage = z.infer<typeof EnrichedMessageSchema>
