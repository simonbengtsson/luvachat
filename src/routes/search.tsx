import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getConversationDisplayName } from "@/core/conversationDisplay"
import { useConversations } from "@/core/conversationsQuery"
import { getSession as getLuvaSession } from "@/core/luvabase"
import { messageSearchInfiniteQueryOptions } from "@/core/messageSearchQuery"
import { useWorkspaceMembers } from "@/core/members"
import type { MessageSearchResult } from "@/core/models"
import { cn } from "@/lib/utils"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { MessageSquareTextIcon, SearchIcon } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { z } from "zod"

const searchSnippetStartMarker = "__match_start__"
const searchSnippetEndMarker = "__match_end__"

const searchRouteSchema = z.object({
  q: z.string().optional(),
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
}: {
  result: MessageSearchResult
  authorName: string
  authorImageUrl?: string | null
  conversationName: string
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
                  <span className="truncate">{conversationName}</span>
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
  const [query, setQuery] = useState(search.q ?? "")
  const searchQuery = useInfiniteQuery(
    messageSearchInfiniteQueryOptions(submittedQuery),
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

  const results = searchQuery.data?.results ?? []
  const members = membersQuery.data ?? []
  const conversations = conversationsQuery.data ?? []
  const currentUserId = sessionQuery.data?.user.id ?? ""
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextQuery = query.trim()
    await navigate({
      to: "/search",
      search: nextQuery ? { q: nextQuery } : {},
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
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search messages with FTS5 query syntax"
              aria-label="Search messages"
              className="h-10"
            />
            <Button type="submit" size="lg" className="sm:self-start">
              <SearchIcon />
              Search
            </Button>
          </form>
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
                const conversation = conversationsById.get(result.conversationId)

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
