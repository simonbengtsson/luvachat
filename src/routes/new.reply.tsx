import { NewMessageInput } from "@/components/new-message-input"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import type { Member } from "@/core/luvabase"
import { getWorkspaceMembers } from "@/route.functions"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

export const Route = createFileRoute("/new/reply")({
  validateSearch: (search) => ({ members: `${search.members || ""}` }),
  loaderDeps: ({ search }) => ({ members: search.members }),
  loader: async ({ deps }) => {
    const members = await getWorkspaceMembers()
    const memberIds = parseMemberIds(deps.members)
    const memberIdsSet = new Set(members.map((member) => member.id))

    if (
      memberIds.length === 0 ||
      memberIds.some((memberId) => !memberIdsSet.has(memberId))
    ) {
      throw notFound()
    }

    return { members, memberIds }
  },
  component: RouteComponent,
})

function parseMemberIds(value?: string) {
  return Array.from(new Set((value ?? "").split(",").filter(Boolean)))
}

function getConversationName(members: Member[], memberIds: string[]) {
  const membersById = new Map(members.map((member) => [member.id, member]))

  return memberIds
    .map((memberId) => membersById.get(memberId)?.name?.trim() || memberId)
    .filter(Boolean)
    .join(", ")
}

function RouteComponent() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { members, memberIds } = Route.useLoaderData()
  const conversationName = getConversationName(members, memberIds)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SiteHeader
        title="New"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                to: "/new",
                search,
              })
            }
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        }
      />
      <div className="shrink-0 bg-background px-4 py-4">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">To</div>
            <div className="truncate text-sm font-medium">
              {conversationName}
            </div>
          </div>
          <NewMessageInput
            memberIds={memberIds}
            members={members}
            conversationName={conversationName || undefined}
            autoFocus
            onMessageSent={(conversationId) =>
              navigate({
                to: "/c/$conversationId",
                params: { conversationId } as any,
                replace: true,
              })
            }
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-muted/10" />
    </div>
  )
}
