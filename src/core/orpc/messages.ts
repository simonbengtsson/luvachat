import { z } from "zod"
import { base } from "./context"
import { getOrCreateDirectConversation } from "./conversations"
import {
  createMessageInConversation,
  getLatestThreadMessageCreatedAt,
  getMessagesForConversation,
  searchMessagesForUser,
  getThreadsForUser,
  markThreadAsViewed,
  toggleReactionForMessage,
} from "./services/messages"

const attachmentFileSchema = z.custom<File>((value) => value instanceof File)
const directConversationMembersInputSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
})
const threadsInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().optional(),
  unreadOnly: z.boolean().optional(),
})

export const getMessages = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      threadMessageId: z.string().min(1).optional(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    return getMessagesForConversation(context, input)
  })

export const getThreads = base
  .input(threadsInputSchema.optional())
  .handler(async ({ context, input }) => {
    return getThreadsForUser(context, input)
  })

export const searchMessages = base
  .input(
    z.object({
      query: z.string(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    return searchMessagesForUser(context, input)
  })

export const markThreadViewed = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      threadRootMessageId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const latestMessageCreatedAt = await getLatestThreadMessageCreatedAt(
      context,
      input.conversationId,
      input.threadRootMessageId,
    )
    if (!latestMessageCreatedAt) {
      return
    }

    await markThreadAsViewed(
      context,
      input.conversationId,
      input.threadRootMessageId,
      context.userId,
      latestMessageCreatedAt,
    )
  })

export const sendMessage = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      threadRootMessageId: z.string().optional(),
      content: z.string(),
      tiptapJson: z.string().nullable().optional(),
      attachments: z.array(attachmentFileSchema),
    }),
  )
  .handler(async ({ context, input }) => {
    return createMessageInConversation(context, input)
  })

export const sendDirectMessage = base
  .input(
    directConversationMembersInputSchema.extend({
      conversationName: z.string().optional(),
      content: z.string(),
      tiptapJson: z.string().nullable().optional(),
      attachments: z.array(attachmentFileSchema),
    }),
  )
  .handler(async ({ context, input }) => {
    const { conversation, createdConversation } =
      await getOrCreateDirectConversation(
        context,
        input.memberIds,
        input.conversationName,
      )

    const message = await createMessageInConversation(context, {
      conversationId: conversation.id,
      content: input.content,
      tiptapJson: input.tiptapJson,
      attachments: input.attachments,
    })

    return {
      conversation,
      message,
      createdConversation,
    }
  })

export const toggleMessageReaction = base
  .input(
    z.object({
      messageId: z.string().min(1),
      emoji: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    return toggleReactionForMessage(context, input)
  })
