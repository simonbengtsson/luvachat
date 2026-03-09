import { SiteHeader } from "@/components/site-header"
import { conversationsQueryOptions } from "@/core/conversationsQuery"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

export const Route = createFileRoute("/c/$conversationId")({
  component: RouteComponent,
})

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const { data: conversations = [] } = useQuery(conversationsQueryOptions())
  const conversation = useMemo(
    () =>
      conversations.find((currentConversation) => currentConversation.id === conversationId) ??
      null,
    [conversations, conversationId],
  )

  return (
    <div>
      <SiteHeader title={"#" + (conversation?.name ?? conversationId)} />
    </div>
  )
}
