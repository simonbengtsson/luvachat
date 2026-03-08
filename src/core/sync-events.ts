import { z } from "zod"
import { Conversation } from "./schema"

export type ClientEvent = z.infer<typeof ClientEventSchema>
export const ClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
    timestamp: z.string(),
  }),
])

export type ServerEvent = z.infer<typeof ServerEventSchema>
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pong"),
    timestamp: z.string(),
    fromClientId: z.string().min(1),
  }),
  z.object({
    type: z.literal("initialData"),
    conversations: z.array(Conversation),
  }),
])
