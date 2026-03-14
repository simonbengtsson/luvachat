import { getSessionInfo } from "@luvabase/sdk"
import { createServerFn } from "@tanstack/react-start"
import { env } from "cloudflare:workers"
import { z } from "zod"
import {
  PushSubscriptionInputSchema,
  type Conversation,
  type ConversationWithUserState,
  type Message,
} from "./schema"

export const getConversations = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConversationWithUserState[]> => {
    const session = await getSessionInfo()
    const userId = session.user?.id?.trim() ?? ""
    const syncObject = env.SyncObject.getByName("workspace")
    return syncObject.getConversations(userId)
  },
)

export const getConversation = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async (ctx): Promise<ConversationWithUserState | null> => {
    const session = await getSessionInfo()
    const userId = session.user?.id?.trim() ?? ""
    const syncObject = env.SyncObject.getByName("workspace")
    return syncObject.getConversationById(ctx.data.conversationId, userId)
  })

export const createConversation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
    }),
  )
  .handler(async (ctx): Promise<Conversation> => {
    const syncObject = env.SyncObject.getByName("workspace")
    return syncObject.createConversation(ctx.data.name)
  })

export const deleteConversation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      conversationId: z.string().min(1),
    }),
  )
  .handler(async (ctx): Promise<{ deletedId: string }> => {
    const syncObject = env.SyncObject.getByName("workspace")
    await syncObject.deleteConversation(ctx.data.conversationId)
    return { deletedId: ctx.data.conversationId }
  })

export const getMessages = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      conversationId: z.string(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
    }),
  )
  .handler(
    async (
      ctx,
    ): Promise<{
      messages: Message[]
      nextCursor?: string
    }> => {
      const session = await getSessionInfo()
      const userId = session.user?.id?.trim() ?? ""
      const syncObject = env.SyncObject.getByName("workspace")
      return syncObject.getMessages(
        ctx.data.conversationId,
        ctx.data.limit,
        ctx.data.cursor,
        userId,
      )
    },
  )

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      conversationId: z.string(),
      content: z.string(),
    }),
  )
  .handler(async (ctx): Promise<Message> => {
    const session = await getSessionInfo()
    const userId = session.user?.id?.trim()
    if (!userId) {
      throw new Error("Authenticated user is required to send a message.")
    }

    const syncObject = env.SyncObject.getByName("workspace")
    return syncObject.sendMessage(
      ctx.data.conversationId,
      ctx.data.content,
      userId,
    )
  })

export const getPushPublicKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string }> => {
    const syncObject = env.SyncObject.getByName("workspace")
    return {
      publicKey: await syncObject.getVapidPublicKey(),
    }
  },
)

export const savePushSubscription = createServerFn({ method: "POST" })
  .inputValidator(PushSubscriptionInputSchema)
  .handler(async (ctx): Promise<{ ok: true }> => {
    const session = await getSessionInfo()
    const userId = session.user?.id?.trim()
    if (!userId) {
      throw new Error(
        "Authenticated user is required to save a push subscription.",
      )
    }

    const syncObject = env.SyncObject.getByName("workspace")
    await syncObject.savePushSubscription(userId, ctx.data)
    return { ok: true }
  })

export const deletePushSubscription = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      endpoint: z.url(),
    }),
  )
  .handler(async (ctx): Promise<{ ok: true }> => {
    const session = await getSessionInfo()
    const userId = session.user?.id?.trim()
    if (!userId) {
      throw new Error(
        "Authenticated user is required to delete a push subscription.",
      )
    }

    const syncObject = env.SyncObject.getByName("workspace")
    await syncObject.deletePushSubscription(userId, ctx.data.endpoint)
    return { ok: true }
  })
