import { z } from "zod"
import { EnrichedMessage } from "./models"

export type ServerEvent = z.infer<typeof ServerEventSchema>
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workspaceUpdated"),
  }),
  z.object({
    type: z.literal("messageCreated"),
    message: EnrichedMessage,
  }),
])
