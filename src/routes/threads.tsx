import { SiteHeader } from "@/components/site-header"
import {
  ChatMessage,
  ChatMessageAuthor,
  ChatMessageAvatar,
  ChatMessageAvatarFallback,
  ChatMessageAvatarImage,
  ChatMessageContainer,
  ChatMessageContent,
  ChatMessageFooter,
  ChatMessageHeader,
  ChatMessageMarkdown,
  ChatMessageThread,
  ChatMessageThreadAction,
  ChatMessageThreadReplyCount,
  ChatMessageThreadTimestamp,
  ChatMessageTimestamp,
} from "@/components/ui/chat-message"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { parseTiptapJson, TiptapContent } from "@/components/ui/tiptap-content"
import { Toggle } from "@/components/ui/toggle"
import { getConversationDisplayName } from "@/core/conversationDisplay"
import { useConversations } from "@/core/conversationsQuery"
import { getSession as getLuvaSession, type Member } from "@/core/luvabase"
import { useWorkspaceMembers } from "@/core/members"
import type { EnrichedConversation } from "@/core/models"
import { threadsInfiniteQueryOptions } from "@/core/threadsQuery"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { FileIcon, MessageSquareTextIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export const Route = createFileRoute("/threads")({
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

function isImageAttachment(contentType: string) {
  return contentType.startsWith("image/")
}

function getAttachmentUrl(storageKey: string) {
  return `/assets/${storageKey.split("/").map(encodeURIComponent).join("/")}`
}

function truncateFileNameMiddle(fileName: string, maxLength = 19) {
  if (fileName.length <= maxLength) {
    return fileName
  }

  const separator = "..."
  const visibleLength = maxLength - separator.length
  const startLength = Math.ceil(visibleLength / 2)
  const endLength = Math.floor(visibleLength / 2)

  return `${fileName.slice(0, startLength)}${separator}${fileName.slice(
    fileName.length - endLength,
  )}`
}

function getConversationLabel(
  conversationId: string,
  conversationsById: Map<string, EnrichedConversation>,
  currentUserId: string,
  membersById: Map<string, Member>,
) {
  const conversation = conversationsById.get(conversationId)
  if (!conversation) {
    return conversationId
  }

  const displayName = getConversationDisplayName(
    conversation,
    currentUserId,
    membersById,
  )

  return conversation.type === "channel" ? `#${displayName}` : displayName
}

function RouteComponent() {
  const navigate = useNavigate()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const threadsQuery = useInfiniteQuery(
    threadsInfiniteQueryOptions(showUnreadOnly),
  )
  const conversationsQuery = useConversations()
  const membersQuery = useWorkspaceMembers()
  const sessionQuery = useQuery({
    queryKey: ["threads-session"],
    queryFn: () => getSession(),
  })

  const threads = threadsQuery.data?.threads ?? []

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [showUnreadOnly])

  useEffect(() => {
    const loadMoreElement = loadMoreRef.current
    const scrollContainer = scrollContainerRef.current

    if (
      !loadMoreElement ||
      !scrollContainer ||
      !threadsQuery.hasNextPage ||
      threadsQuery.isPending
    ) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          threadsQuery.hasNextPage &&
          !threadsQuery.isFetchingNextPage
        ) {
          void threadsQuery.fetchNextPage()
        }
      },
      {
        root: scrollContainer,
        rootMargin: "200px",
        threshold: 0,
      },
    )

    observer.observe(loadMoreElement)

    return () => {
      observer.disconnect()
    }
  }, [
    threadsQuery.fetchNextPage,
    threadsQuery.hasNextPage,
    threadsQuery.isFetchingNextPage,
    threadsQuery.isPending,
  ])

  if (threadsQuery.error) {
    throw threadsQuery.error
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

  const conversations = conversationsQuery.data ?? []
  const members = membersQuery.data ?? []
  const currentUserId = sessionQuery.data!.id
  const conversationsById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  )
  const membersById = new Map(members.map((member) => [member.id, member]))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader
        title="Threads"
        actions={
          <Toggle
            aria-label="Show unread threads only"
            pressed={showUnreadOnly}
            onPressedChange={setShowUnreadOnly}
            variant="outline"
          >
            Unread
          </Toggle>
        }
      />
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6"
      >
        {threadsQuery.isPending ||
        conversationsQuery.isPending ||
        membersQuery.isPending ||
        sessionQuery.isPending ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`threads-loading-${index}`}
                className="h-40 animate-pulse rounded-2xl border border-border/70 bg-muted/40"
              />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <Empty className="border border-dashed border-border/70 bg-muted/20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareTextIcon />
              </EmptyMedia>
              <EmptyTitle>
                {showUnreadOnly ? "No unread threads" : "No threads yet"}
              </EmptyTitle>
              <EmptyDescription>
                {showUnreadOnly
                  ? "You're all caught up."
                  : "Threads you participate in will show up here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-5">
            {threads.map((thread) => {
              const author = membersById.get(thread.userId)
              const authorName = author?.name ?? thread.userId
              const tiptapDocument = parseTiptapJson(thread.tiptapJson)
              const threadReplyLabel =
                thread.threadReplyCount === 1
                  ? "1 reply"
                  : `${thread.threadReplyCount} replies`
              const conversationLabel = getConversationLabel(
                thread.conversationId,
                conversationsById,
                currentUserId,
                membersById,
              )

              return (
                <section
                  key={thread.id}
                  className="rounded-2xl border border-border/70 bg-background p-2"
                >
                  <div className="flex items-center gap-2 px-3 pt-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {thread.threadIsUnread ? (
                      <span
                        aria-hidden
                        className="size-2 rounded-full bg-foreground"
                      />
                    ) : null}
                    {conversationLabel}
                  </div>
                  <ChatMessage className="rounded-xl hover:bg-transparent">
                    <ChatMessageAvatar className="mt-0.5 size-9">
                      <ChatMessageAvatarImage
                        src={author?.imageUrl ?? undefined}
                        alt={authorName}
                      />
                      <ChatMessageAvatarFallback className="text-xs">
                        {getInitials(authorName)}
                      </ChatMessageAvatarFallback>
                    </ChatMessageAvatar>
                    <ChatMessageContainer>
                      <ChatMessageHeader>
                        <ChatMessageAuthor>{authorName}</ChatMessageAuthor>
                        <ChatMessageTimestamp createdAt={thread.createdAt} />
                      </ChatMessageHeader>
                      {thread.content || thread.attachments.length > 0 ? (
                        <ChatMessageContent className="px-2 py-0">
                          {thread.content ? (
                            tiptapDocument ? (
                              <TiptapContent content={tiptapDocument} />
                            ) : (
                              <ChatMessageMarkdown content={thread.content} />
                            )
                          ) : null}
                          {thread.attachments.length > 0 ? (
                            <div className="overflow-x-auto pt-1 pb-1">
                              <div className="flex gap-2">
                                {thread.attachments.map((attachment) => {
                                  const attachmentUrl = getAttachmentUrl(
                                    attachment.storageKey,
                                  )

                                  if (
                                    isImageAttachment(attachment.contentType)
                                  ) {
                                    return (
                                      <a
                                        key={attachment.id}
                                        href={attachmentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block w-36 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted/20"
                                      >
                                        <img
                                          src={attachmentUrl}
                                          alt={attachment.fileName}
                                          loading="lazy"
                                          className="h-28 w-full object-cover"
                                        />
                                      </a>
                                    )
                                  }

                                  return (
                                    <a
                                      key={attachment.id}
                                      href={attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={attachment.fileName}
                                      className="flex h-28 w-36 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-center hover:bg-muted/40"
                                    >
                                      <FileIcon className="size-5 shrink-0 text-muted-foreground" />
                                      <span className="w-full overflow-hidden whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
                                        {truncateFileNameMiddle(
                                          attachment.fileName,
                                        )}
                                      </span>
                                    </a>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}
                        </ChatMessageContent>
                      ) : null}
                      <ChatMessageFooter className="px-2 pt-0">
                        <ChatMessageThread
                          type="button"
                          onClick={() => {
                            void navigate({
                              to: "/c/$conversationId",
                              params: {
                                conversationId: thread.conversationId,
                              } as any,
                              search: { thread: thread.id },
                            })
                          }}
                        >
                          <ChatMessageThreadReplyCount>
                            {threadReplyLabel}
                          </ChatMessageThreadReplyCount>
                          {thread.threadLastReplyAt ? (
                            <ChatMessageThreadTimestamp
                              date={thread.threadLastReplyAt}
                            />
                          ) : null}
                          <ChatMessageThreadAction />
                        </ChatMessageThread>
                      </ChatMessageFooter>
                    </ChatMessageContainer>
                  </ChatMessage>
                </section>
              )
            })}
            {threadsQuery.hasNextPage ? (
              <div
                ref={loadMoreRef}
                className="flex justify-center py-2 text-sm text-muted-foreground"
              >
                {threadsQuery.isFetchingNextPage
                  ? "Loading more threads..."
                  : "Scroll for more"}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
