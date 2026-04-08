import { z } from "zod"

export const conversationSearchSchema = z.object({
  thread: z.string().optional(),
})
