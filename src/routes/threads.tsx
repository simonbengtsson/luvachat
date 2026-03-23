import { SiteHeader } from "@/components/site-header"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/threads")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <SiteHeader title="Threads" />
    </div>
  )
}
