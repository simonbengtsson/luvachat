import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { pushSubscriptionsTable } from "../schema"
import { base } from "./context"

const PushSubscriptionInputSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export const getVapidPublicKey = base.handler(async ({ context }) => {
  return context.vapidDetails!.publicKey
})

export const savePushSubscription = base
  .input(PushSubscriptionInputSchema)
  .handler(async ({ context, input }) => {
    const now = new Date().toISOString()

    await context.db
      .insert(pushSubscriptionsTable)
      .values({
        endpoint: input.endpoint,
        userId: context.userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          userId: context.userId,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          updatedAt: now,
        },
      })
  })

export const deletePushSubscription = base
  .input(
    z.object({
      endpoint: z.url(),
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, context.userId),
          eq(pushSubscriptionsTable.endpoint, input.endpoint),
        ),
      )
  })
