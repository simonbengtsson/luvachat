import { SiteHeader } from "@/components/site-header"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/c/$channelId")({
  component: RouteComponent,
})

function RouteComponent() {
  const { channelId } = Route.useParams()
  return (
    <div>
      <SiteHeader title={"#" + channelId} />
      Hello {channelId}!
    </div>
  )
}
