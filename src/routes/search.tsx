import { SiteHeader } from "@/components/site-header"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/search")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <SiteHeader title="Search" />
    </div>
  )
}
