import { getConversations } from "@/core/functions"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () => {
        const conversations = await getConversations()
        const first = conversations.at(0)
        if (!first) {
          return new Response("No channels yet")
        }
        return new Response("", {
          status: 302,
          headers: { Location: `/c/${first.id}` },
        })
      },
    },
  },
})
