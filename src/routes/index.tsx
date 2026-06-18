import { getSession } from "@/core/luvabase"
import { createServerOrpcClient } from "@/core/orpcClient"
import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSession(request, env)
        const syncObject = env.SyncObject.getByName("workspace")
        const serverOrpcClient = createServerOrpcClient(syncObject, session.id)
        const conversations = await serverOrpcClient.getConversations()
        let first = conversations.at(0)

        if (!first) {
          const conversation = await serverOrpcClient.createConversation({
            name: "general",
          })
          first = {
            ...conversation,
            memberIds: [],
            lastViewedAt: null,
            lastMessageAt: null,
            notificationLevel: "all",
          }
        }

        return new Response("", {
          status: 302,
          headers: { Location: `/c/${first.id}` },
        })
      },
    },
  },
})
