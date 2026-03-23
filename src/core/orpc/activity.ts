import { z } from "zod"
import { base } from "./context"
import { getActivityForUser } from "./services/activity"

export const getActivity = base
  .input(
    z.object({
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
      unreadOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    return getActivityForUser(context, input)
  })
