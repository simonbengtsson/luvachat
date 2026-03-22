import { SiteHeader } from "@/components/site-header"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/activity")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader title="Activity" actions={[]} />
    </div>
  )
}
