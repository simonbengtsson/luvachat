import { z } from "zod"

const EnrichedMessageAttachmentSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  userId: z.string(),
  storageKey: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.string(),
})

const EnrichedMessageMentionSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  type: z.string(),
  mentionedUserId: z.string().nullable(),
  createdAt: z.string(),
})

const EnrichedMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  parentMessageId: z.string().nullable(),
  content: z.string(),
  tiptapJson: z.string().nullable(),
  createdAt: z.string(),
  userId: z.string(),
  attachments: z.array(EnrichedMessageAttachmentSchema),
  mentions: z.array(EnrichedMessageMentionSchema),
  threadReplyCount: z.number().int().nonnegative().default(0),
  threadLastReplyAt: z.string().nullable().default(null),
})

export type ServerEvent = z.infer<typeof ServerEventSchema>
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workspaceUpdated"),
  }),
  z.object({
    type: z.literal("messageCreated"),
    message: EnrichedMessageSchema,
  }),
])
