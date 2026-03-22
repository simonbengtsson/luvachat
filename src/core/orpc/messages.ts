import { z } from "zod"
import { base } from "./context"
import { getOrCreateDirectConversation } from "./conversations"
import {
  createMessageInConversation,
  getMessagesForConversation,
} from "./services/messages"

const attachmentFileSchema = z.custom<File>((value) => value instanceof File)
const directConversationMembersInputSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
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

export const sendMessage = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      parentMessageId: z.string().optional(),
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
