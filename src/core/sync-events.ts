import { z } from "zod"

export type ClientEvent = z.infer<typeof ClientEventSchema>
export const ClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("createConversation"),
    name: z.string().min(1),
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
    type: z.literal("workspaceUpdated"),
  }),
])
