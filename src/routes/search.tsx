import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getConversationDisplayName } from "@/core/conversationDisplay"
import { useConversations } from "@/core/conversationsQuery"
import { getSession as getLuvaSession, type Member } from "@/core/luvabase"
import { useWorkspaceMembers } from "@/core/members"
import { messageSearchInfiniteQueryOptions } from "@/core/messageSearchQuery"
import type { EnrichedConversation, MessageSearchResult } from "@/core/models"
import { cn } from "@/lib/utils"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import {
  CircleHelpIcon,
  HashIcon,
  MessageSquareTextIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { z } from "zod"

const searchSnippetStartMarker = "__match_start__"
const searchSnippetEndMarker = "__match_end__"

const searchRouteSchema = z.object({
  q: z.string().optional(),
  conversationId: z.string().optional(),
})

export const Route = createFileRoute("/search")({
  validateSearch: searchRouteSchema,
  component: RouteComponent,
})

const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest()
  return getLuvaSession(request)
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

function formatSearchTime(createdAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt))
}

function getConversationSearchMeta(
  conversationId: string,
  currentUserId: string,
  conversationsById: Map<string, EnrichedConversation>,
  membersById: Map<string, Member>,
) {
  const conversation = conversationsById.get(conversationId)
  if (!conversation) {
    return {
      label: conversationId,
      isChannel: false,
    }
  }

  return {
    label: getConversationDisplayName(conversation, currentUserId, membersById),
    isChannel: conversation.type === "channel",
  }
}

function SearchPreview({ preview }: { preview: string }) {
  const parts = preview.split(
    new RegExp(`(${searchSnippetStartMarker}|${searchSnippetEndMarker})`, "g"),
  )
  let isHighlighted = false

  return parts.map((part, index) => {
    if (part === searchSnippetStartMarker) {
      isHighlighted = true
      return null
    }

    if (part === searchSnippetEndMarker) {
      isHighlighted = false
      return null
    }

    return isHighlighted ? (
      <mark
        key={index}
        className="rounded-sm bg-primary/15 px-0.5 text-foreground"
      >
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    )
  })
}

function SearchResultRow({
  result,
  authorName,
  authorImageUrl,
  conversationName,
  isChannel,
}: {
  result: MessageSearchResult
  authorName: string
  authorImageUrl?: string | null
  conversationName: string
  isChannel: boolean
}) {
  return (
    <Link
      to="/c/$conversationId"
      params={{ conversationId: result.conversationId } as any}
      search={
        result.threadRootMessageId ? { thread: result.threadRootMessageId } : {}
      }
      className="block"
    >
      <article className="rounded-2xl border border-border/70 bg-background px-4 py-4 transition-colors hover:bg-muted/30">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {authorImageUrl ? (
              <img
                src={authorImageUrl}
                alt={authorName}
                className="size-full rounded-full object-cover"
              />
            ) : (
              getInitials(authorName)
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {authorName}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {isChannel ? `#${conversationName}` : conversationName}
                  </span>
                  {result.threadRootMessageId ? (
                    <>
                      <span aria-hidden>•</span>
                      <span>Thread</span>
                    </>
                  ) : null}
                </div>
              </div>

              <time
                dateTime={result.createdAt}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {formatSearchTime(result.createdAt)}
              </time>
            </div>

            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
              <SearchPreview preview={result.contentPreview} />
            </p>
          </div>
        </div>
      </article>
    </Link>
  )
}

function SearchResultSkeleton() {
  return (
    <div className="rounded-2xl border border-border/70 bg-background px-4 py-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  )
}

function RouteComponent() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const submittedQuery = search.q?.trim() ?? ""
  const filteredConversationId = search.conversationId
  const [query, setQuery] = useState(search.q ?? "")
  const searchQuery = useInfiniteQuery(
    messageSearchInfiniteQueryOptions(submittedQuery, filteredConversationId),
  )
  const conversationsQuery = useConversations()
  const membersQuery = useWorkspaceMembers()
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  })

  useEffect(() => {
    setQuery(search.q ?? "")
  }, [search.q])

  if (searchQuery.error) {
    throw searchQuery.error
  }

  if (conversationsQuery.error) {
    throw conversationsQuery.error
  }

  if (membersQuery.error) {
    throw membersQuery.error
  }

  if (sessionQuery.error) {
    throw sessionQuery.error
  }

  if (sessionQuery.isPending) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <SiteHeader title="Search" />

        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="border-b px-4 py-4 lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 sm:w-28" />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SearchResultSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const results = searchQuery.data?.results ?? []
  const members = membersQuery.data ?? []
  const conversations = conversationsQuery.data ?? []
  const currentUserId = sessionQuery.data.id
  const membersById = new Map(members.map((member) => [member.id, member]))
  const conversationsById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  )
  const isLoadingResults =
    submittedQuery.length > 0 &&
    (searchQuery.isPending ||
      (results.length > 0 &&
        (membersQuery.isPending ||
          conversationsQuery.isPending ||
          sessionQuery.isPending)))
  const scopedConversationMeta = filteredConversationId
    ? getConversationSearchMeta(
        filteredConversationId,
        currentUserId,
        conversationsById,
        membersById,
      )
    : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextQuery = query.trim()
    await navigate({
      to: "/search",
      search:
        nextQuery || filteredConversationId
          ? {
              ...(nextQuery ? { q: nextQuery } : {}),
              ...(filteredConversationId
                ? { conversationId: filteredConversationId }
                : {}),
            }
          : {},
    })
  }

  async function clearConversationFilter() {
    await navigate({
      to: "/search",
      search: submittedQuery ? { q: submittedQuery } : {},
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader title="Search" />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="border-b px-4 py-4 lg:px-6">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={handleSubmit}
          >
            <InputGroup className="h-10 flex-1">
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search messages"
                aria-label="Search messages"
                autoFocus
              />
              <InputGroupAddon align="inline-end">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <InputGroupButton
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Search query help"
                      />
                    }
                  >
                    <CircleHelpIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="end"
                    className="max-w-sm"
                  >
                    <div className="space-y-1">
                      <p>FTS queries supported.</p>
                      <p>
                        Try plain text, <code>"exact phrase"</code>,{" "}
                        <code>deploy*</code>, <code>error OR failure</code>, or{" "}
                        <code>error NOT warning</code>.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </InputGroupAddon>
            </InputGroup>
            <Button type="submit" size="lg" className="sm:self-start">
              <SearchIcon />
              Search
            </Button>
          </form>
          {scopedConversationMeta ? (
            <div className="mt-3">
              <Badge
                variant="secondary"
                className="h-auto gap-1.5 py-1 pr-1 text-xs"
              >
                <span className="flex items-center gap-1">
                  <span>Search in</span>
                  {scopedConversationMeta.isChannel ? (
                    <HashIcon className="size-3 shrink-0" />
                  ) : null}
                  <span>{scopedConversationMeta.label}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void clearConversationFilter()
                  }}
                  className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                  aria-label="Remove conversation filter"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
          {submittedQuery.length === 0 ? (
            <Empty className="border border-dashed border-border/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>Search all messages</EmptyTitle>
                <EmptyDescription>
                  Enter a full-text query to search message content across every
                  conversation and thread.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : isLoadingResults ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SearchResultSkeleton key={index} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <Empty className="border border-dashed border-border/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareTextIcon />
                </EmptyMedia>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  No messages matched{" "}
                  <span className="font-medium">"{submittedQuery}"</span>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {results.map((result) => {
                const author = membersById.get(result.userId)
                const conversation = conversationsById.get(
                  result.conversationId,
                )

                return (
                  <SearchResultRow
                    key={result.messageId}
                    result={result}
                    authorName={author?.name ?? result.userId}
                    authorImageUrl={author?.imageUrl}
                    conversationName={
                      conversation
                        ? getConversationDisplayName(
                            conversation,
                            currentUserId,
                            membersById,
                          )
                        : result.conversationId
                    }
                    isChannel={conversation?.type === "channel"}
                  />
                )
              })}

              {searchQuery.hasNextPage ? (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      void searchQuery.fetchNextPage()
                    }}
                    disabled={searchQuery.isFetchingNextPage}
                    className={cn(
                      "w-full",
                      searchQuery.isFetchingNextPage && "opacity-80",
                    )}
                  >
                    {searchQuery.isFetchingNextPage
                      ? "Loading more..."
                      : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
