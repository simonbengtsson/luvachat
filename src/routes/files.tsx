import { SiteHeader } from "@/components/site-header"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/files")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <SiteHeader title="Files" />
      Hello "/files"!
    </div>
  )
}
