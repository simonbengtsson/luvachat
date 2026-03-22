import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { PushSubscriptionInputSchema, pushSubscriptionsTable } from "../schema"
import { base } from "./context"

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
