import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/aichat")({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/aichat"!</div>
}
