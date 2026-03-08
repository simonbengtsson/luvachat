import { SiteHeader } from "@/components/site-header"
import { conversationAtom } from "@/core/clientStore"
import { createFileRoute } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { useMemo } from "react"

export const Route = createFileRoute("/c/$conversationId")({
  component: RouteComponent,
})

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const conversation = useAtomValue(
    useMemo(() => conversationAtom(conversationId), [conversationId]),
  )

  return (
    <div>
      <SiteHeader title={"#" + (conversation?.name ?? conversationId)} />
    </div>
  )
}
