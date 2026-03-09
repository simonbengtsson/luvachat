import { createServerFn } from "@tanstack/react-start"
import { env } from "cloudflare:workers"
import type { Conversation } from "./schema"

export const getConversations = createServerFn({ method: "GET" }).handler(
  async (): Promise<Conversation[]> => {
    const syncObject = env.SyncObject.getByName("workspace")
    return syncObject.getConversations()
  },
)
