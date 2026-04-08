import { ConversationReplyInput } from "@/components/conversation-reply-input"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { conversationSearchSchema } from "@/core/conversationSearch"
import { useWorkspaceMembers } from "@/core/members"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

export const Route = createFileRoute("/c/$conversationId/reply")({
  validateSearch: conversationSearchSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const membersQuery = useWorkspaceMembers()
  const members = membersQuery.data ?? []
  const threadMessageId = search.thread || undefined
  const conversationSearch = threadMessageId ? { thread: threadMessageId } : {}
  const placeholder = threadMessageId ? "Reply in thread" : "Jot something down"

  if (membersQuery.error) {
    throw membersQuery.error
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <SiteHeader
        title="Reply"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                to: "/c/$conversationId",
                params: { conversationId },
                search: conversationSearch,
              })
            }
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        }
      />
      <div className="shrink-0 bg-background px-4 py-4">
        <ConversationReplyInput
          conversationId={conversationId}
          threadMessageId={threadMessageId}
          members={members}
          placeholder={placeholder}
          autoFocus
          onMessageSent={() =>
            navigate({
              to: "/c/$conversationId",
              params: { conversationId },
              search: conversationSearch,
              replace: true,
            })
          }
        />
      </div>
      <div className="min-h-0 flex-1 bg-muted/10" />
    </div>
  )
}
