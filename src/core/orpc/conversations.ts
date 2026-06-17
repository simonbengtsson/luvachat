import { z } from "zod"
import { base } from "./context"
import {
  createConversation as createConversationRecord,
  createDirectConversation,
  deleteConversation as deleteConversationRecord,
  findParticipantConversationByMemberIds,
  getConversationByIdForUser,
  getConversationsForUser,
  getLatestRootMessageCreatedAt,
  markConversationAsViewed,
  setConversationNotificationLevel as setConversationNotificationLevelRecord,
} from "./services/conversations"

const directConversationMembersInputSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
})

export const getConversations = base.handler(async ({ context }) => {
  return getConversationsForUser(context)
})

export const getConversationById = base
  .input(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    return getConversationByIdForUser(context, input.conversationId)
  })

export const createConversation = base
  .input(
    z.object({
      name: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    return createConversationRecord(context, input.name)
  })

export const deleteConversation = base
  .input(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    await deleteConversationRecord(context, input.conversationId)
  })

export const getDirectConversationByMemberIds = base
  .input(directConversationMembersInputSchema)
  .handler(async ({ context, input }) => {
    return findParticipantConversationByMemberIds(
      context,
      context.userId,
      input.memberIds,
    )
  })

export const markConversationViewed = base
  .input(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const latestMessageCreatedAt = await getLatestRootMessageCreatedAt(
      context,
      input.conversationId,
    )
    if (!latestMessageCreatedAt) {
      return
    }

    await markConversationAsViewed(
      context,
      input.conversationId,
      context.userId,
      latestMessageCreatedAt,
    )
  })

export const setConversationNotificationLevel = base
  .input(
    z.object({
      conversationId: z.string().min(1),
      notificationLevel: z.enum(["all", "muted"]),
    }),
  )
  .handler(async ({ context, input }) => {
    await setConversationNotificationLevelRecord(
      context,
      input.conversationId,
      context.userId,
      input.notificationLevel,
    )
  })

export async function getOrCreateDirectConversation(
  context: Parameters<typeof findParticipantConversationByMemberIds>[0],
  memberIds: string[],
  conversationName?: string,
) {
  let conversation = await findParticipantConversationByMemberIds(
    context,
    context.userId,
    memberIds,
  )
  let createdConversation = false

  if (!conversation) {
    conversation = await createDirectConversation(
      context,
      context.userId,
      memberIds,
      conversationName,
    )
    createdConversation = true
  }

  return {
    conversation,
    createdConversation,
  }
}
