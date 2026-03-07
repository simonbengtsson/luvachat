import { SiteHeader } from "@/components/site-header"
import { getChannelByName } from "@/core/functions"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/c/$channelName")({
  component: RouteComponent,
})

function RouteComponent() {
  const { channelName } = Route.useParams()
  const channelQuery = useQuery({
    queryKey: ["channel", channelName],
    queryFn: () => getChannelByName({ data: { name: channelName } }),
  })
  const resolvedName = channelQuery.data?.name ?? channelName

  return (
    <div>
      <SiteHeader title={"#" + resolvedName} />
      {channelQuery.isLoading
        ? "Loading channel..."
        : channelQuery.data
          ? `Hello ${channelQuery.data.name}!`
          : "Channel not found"}
    </div>
  )
}
