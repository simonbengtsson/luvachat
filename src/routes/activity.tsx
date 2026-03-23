import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Toggle } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"
import { SiteHeader } from "@/components/site-header"
import { activityQueryOptions } from "@/core/activityQuery"
import type { ActivityFeedItem } from "@/core/models"
import { useWorkspaceMembers } from "@/core/members"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  AtSignIcon,
  MessageSquareTextIcon,
  SmileIcon,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/activity")({
  component: RouteComponent,
})

function getInitials(value?: string | null) {
  const name = value?.trim()

  if (!name) {
    return "??"
  }

  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
  }

  return name.slice(0, 2).toUpperCase()
}

function formatActivityTime(createdAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt))
}

function getActivityLabel(type: ActivityFeedItem["type"]) {
  switch (type) {
    case "mention":
      return "Mention"
    case "reaction":
      return "Reaction"
    case "thread_reply":
      return "Thread"
  }
}

function getActivityIcon(type: ActivityFeedItem["type"]) {
  switch (type) {
    case "mention":
      return AtSignIcon
    case "reaction":
      return SmileIcon
    case "thread_reply":
      return MessageSquareTextIcon
  }
}

function getActivitySummary(activity: ActivityFeedItem, actorName: string) {
  const additionalActorCount = activity.actorUserIds.length - 1
  const actorSummary =
    additionalActorCount > 0
      ? `${actorName} and ${additionalActorCount} others`
      : actorName

  switch (activity.type) {
    case "mention":
      return `${actorSummary} mentioned you`
    case "reaction":
      return `${actorSummary} reacted to a message`
    case "thread_reply":
      return `${actorSummary} replied in a thread`
  }
}

function getActivityPreview(activity: ActivityFeedItem) {
  if (activity.previewText) {
    return activity.previewText
  }

  if (activity.previewAttachmentCount === 1) {
    return "Shared an attachment"
  }

  if (activity.previewAttachmentCount > 1) {
    return `Shared ${activity.previewAttachmentCount} attachments`
  }

  return "No preview available"
}

function ActivityListItem({
  activity,
  actorName,
  actorImageUrl,
}: {
  activity: ActivityFeedItem
  actorName: string
  actorImageUrl?: string | null
}) {
  const ActivityIcon = getActivityIcon(activity.type)

  return (
    <Link
      to="/c/$conversationId"
      params={{ conversationId: activity.conversationId } as any}
      search={
        activity.threadRootMessageId
          ? { thread: activity.threadRootMessageId }
          : {}
      }
      className="block"
    >
      <article className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-4 transition-colors hover:bg-muted/30">
        <Avatar className="mt-0.5 size-10">
          <AvatarImage src={actorImageUrl ?? undefined} alt={actorName} />
          <AvatarFallback className="text-xs">
            {getInitials(actorName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm text-foreground",
                    activity.isUnread && "font-semibold",
                  )}
                >
                  {getActivitySummary(activity, actorName)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <ActivityIcon className="size-3.5" />
                  {getActivityLabel(activity.type)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {getActivityPreview(activity)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {activity.isUnread ? (
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-foreground"
                />
              ) : null}
              {activity.eventCount > 1 ? (
                <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                  {activity.eventCount}
                </span>
              ) : null}
              <time
                dateTime={activity.latestCreatedAt}
                className="text-xs text-muted-foreground"
              >
                {formatActivityTime(activity.latestCreatedAt)}
              </time>
            </div>
          </div>
        </div>
      </article>
    </Link>
  )
}

function RouteComponent() {
  const activityQuery = useQuery(activityQueryOptions())
  const membersQuery = useWorkspaceMembers()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  if (activityQuery.error) {
    throw activityQuery.error
  }

  if (membersQuery.error) {
    throw membersQuery.error
  }

  const activity = activityQuery.data ?? []
  const filteredActivity = showUnreadOnly
    ? activity.filter((activityItem) => activityItem.isUnread)
    : activity
  const members = membersQuery.data ?? []
  const membersById = new Map(members.map((member) => [member.id, member]))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader
        title="Activity"
        actions={
          <Toggle
            aria-label="Show unread activity only"
            pressed={showUnreadOnly}
            onPressedChange={setShowUnreadOnly}
            variant="outline"
          >
            Unread
          </Toggle>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
        {activityQuery.isPending || membersQuery.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`activity-loading-${index}`}
                className="h-24 animate-pulse rounded-2xl border border-border/70 bg-muted/40"
              />
            ))}
          </div>
        ) : filteredActivity.length === 0 ? (
          <Empty className="border border-dashed border-border/70 bg-muted/20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareTextIcon />
              </EmptyMedia>
              <EmptyTitle>
                {showUnreadOnly ? "No unread activity" : "No activity yet"}
              </EmptyTitle>
              <EmptyDescription>
                {showUnreadOnly
                  ? "You're all caught up."
                  : "Mentions and thread replies will show up here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {filteredActivity.map((activityItem) => {
              const actor = membersById.get(activityItem.latestActorUserId)
              const actorName = actor?.name ?? activityItem.latestActorUserId

              return (
                <ActivityListItem
                  key={activityItem.id}
                  activity={activityItem}
                  actorName={actorName}
                  actorImageUrl={actor?.imageUrl}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
