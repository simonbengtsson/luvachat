import EmojiPicker from "@/components/shadcnblocks/emoji-picker"
import { SiteHeader } from "@/components/site-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { conversationsQueryOptions } from "@/core/conversationsQuery"
import { sendMessage } from "@/core/functions"
import { messagesInfiniteQueryOptions } from "@/core/messagesQuery"
import { getMembers, getSessionInfo, type Member } from "@luvabase/sdk"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import {
  EllipsisVerticalIcon,
  PlusIcon,
  SendHorizontalIcon,
  Smile,
} from "lucide-react"
import type { FormEvent, KeyboardEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

export const Route = createFileRoute("/c/$conversationId")({
  component: RouteComponent,
})

const getConversationMeta = createServerFn({ method: "GET" }).handler(
  async () => {
    const [members, session] = await Promise.all([
      getMembers(),
      getSessionInfo(),
    ])
    return {
      members,
      session,
    }
  },
)

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

function formatMessageTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const now = Date.now()
  const ageMs = now - date.getTime()
  const hours24 = 24 * 60 * 60 * 1000

  if (ageMs < hours24) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
  }).format(date)
}

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const { data: conversations = [] } = useQuery(conversationsQueryOptions())
  const conversationMetaQuery = useQuery({
    queryKey: ["conversation-meta"],
    queryFn: () => getConversationMeta(),
  })
  const membersById = useMemo(
    () =>
      new Map<string, Member>(
        (conversationMetaQuery.data?.members ?? []).map((member) => [
          member.id,
          member,
        ]),
      ),
    [conversationMetaQuery.data?.members],
  )
  const currentUserId = conversationMetaQuery.data?.session.user?.id ?? "user-1"

  return (
    <>
      {conversations.map((conversation) => (
        <ConversationView
          key={conversation.id}
          conversationId={conversation.id}
          conversationName={conversation.name}
          isActive={conversation.id === conversationId}
          membersById={membersById}
          currentUserId={currentUserId}
        />
      ))}
    </>
  )
}

function ConversationView({
  conversationId,
  conversationName,
  isActive,
  membersById,
  currentUserId,
}: {
  conversationId: string
  conversationName: string | null
  isActive: boolean
  membersById: Map<string, Member>
  currentUserId: string
}) {
  const queryClient = useQueryClient()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(messagesInfiniteQueryOptions(conversationId))

  const messages = data?.messages ?? []

  const [messageContent, setMessageContent] = useState("")
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const previousScrollHeightRef = useRef<number>(0)
  const previousMessagesLengthRef = useRef<number>(0)
  const hasScrolledToBottomRef = useRef(false)

  const focusComposer = () => {
    if (!isActive) return
    textareaRef.current?.focus({ preventScroll: true })
  }

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "auto") => {
    const container = scrollContainerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
  }

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      sendMessage({
        data: {
          conversationId,
          content,
          authorId: currentUserId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      })
      setMessageContent("")
      focusComposer()
      // Scroll to bottom after sending without affecting page viewport
      setTimeout(() => {
        scrollMessagesToBottom("smooth")
      }, 100)
    },
  })

  const submitMessage = () => {
    if (messageContent.trim()) {
      sendMessageMutation.mutate(messageContent)
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submitMessage()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submitMessage()
    }
  }

  const insertEmojiAtCursor = (emoji: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setMessageContent((previous) => previous + emoji)
      return
    }

    const selectionStart = textarea.selectionStart ?? messageContent.length
    const selectionEnd = textarea.selectionEnd ?? selectionStart
    const nextCursorPosition = selectionStart + emoji.length

    setMessageContent((previous) => {
      return (
        previous.slice(0, selectionStart) + emoji + previous.slice(selectionEnd)
      )
    })

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition)
    })
  }

  // Scroll to bottom on initial load only (once per conversation view)
  useEffect(() => {
    if (!isActive) return
    if (!hasScrolledToBottomRef.current && messages.length > 0) {
      scrollMessagesToBottom()
      hasScrolledToBottomRef.current = true
      previousMessagesLengthRef.current = messages.length
      // Wait a bit before enabling infinite scroll to let scroll settle
      setTimeout(() => {
        setIsInitialLoadComplete(true)
      }, 300)
    }
  }, [isActive, messages.length])

  // Focus input on route switch without scrolling the page
  useEffect(() => {
    focusComposer()
  }, [isActive])

  // Preserve scroll position when loading older messages
  useEffect(() => {
    if (!isActive || !scrollContainerRef.current || !isInitialLoadComplete) {
      return
    }

    const container = scrollContainerRef.current
    const currentMessagesLength = messages.length
    const previousMessagesLength = previousMessagesLengthRef.current

    // If messages increased (older messages loaded)
    if (
      currentMessagesLength > previousMessagesLength &&
      previousMessagesLength > 0
    ) {
      const previousScrollHeight = previousScrollHeightRef.current
      const currentScrollHeight = container.scrollHeight

      // Maintain scroll position by adjusting for new content height
      const scrollHeightDiff = currentScrollHeight - previousScrollHeight
      container.scrollTop = container.scrollTop + scrollHeightDiff
    }

    previousMessagesLengthRef.current = currentMessagesLength
    previousScrollHeightRef.current = container.scrollHeight
  }, [isActive, messages.length, isInitialLoadComplete])

  // Infinite scroll: load more when scrolling near top
  useEffect(() => {
    if (!isActive) return
    if (!loadMoreRef.current || !scrollContainerRef.current) return
    // Don't set up observer until initial load is done
    if (!isInitialLoadComplete) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Save scroll height before fetching
          if (scrollContainerRef.current) {
            previousScrollHeightRef.current =
              scrollContainerRef.current.scrollHeight
          }
          fetchNextPage()
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "50px",
        threshold: 0,
      },
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [
    isActive,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isInitialLoadComplete,
  ])

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ display: isActive ? "flex" : "none" }}
    >
      <SiteHeader title={"#" + (conversationName ?? conversationId)} />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Messages container with native scroll */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overscroll-none"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div className="max-w-full space-y-4 px-6 py-4">
            {hasNextPage && (
              <div ref={loadMoreRef} className="flex justify-center py-2">
                <div className="text-sm text-muted-foreground">
                  {isFetchingNextPage ? "Loading..." : "Scroll up for more"}
                </div>
              </div>
            )}

            {messages.map((message) => {
              const author = membersById.get(message.authorId)
              const authorName = author?.name ?? message.authorId

              return (
                <div
                  key={message.id}
                  className="group/message relative flex gap-3 rounded-xl px-2 py-2 hover:bg-muted/40"
                >
                  <Avatar className="mt-0.5 size-9">
                    <AvatarImage
                      src={author?.imageUrl ?? undefined}
                      alt={authorName}
                    />
                    <AvatarFallback className="text-xs">
                      {getInitials(authorName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">
                        {authorName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMessageTimestamp(message.createdAt)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-background hover:text-foreground">
                        <EllipsisVerticalIcon className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        align="end"
                        className="min-w-36"
                      >
                        <DropdownMenuItem>Reply</DropdownMenuItem>
                        <DropdownMenuItem>Copy text</DropdownMenuItem>
                        <DropdownMenuItem>Save for later</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fixed input at bottom */}
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="w-full rounded-2xl border border-border/70 bg-card shadow-sm">
              <Textarea
                ref={textareaRef}
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Jot something down"
                rows={1}
                className="min-h-0 resize-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between border-t border-border/70 px-2 py-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="Attach file"
                  >
                    <PlusIcon />
                  </Button>
                  <EmojiPicker
                    onEmojiSelect={insertEmojiAtCursor}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full"
                        aria-label="Add emoji"
                      >
                        <Smile className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
                <Button
                  type="submit"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={
                    !messageContent.trim() || sendMessageMutation.isPending
                  }
                  aria-label="Send message"
                >
                  <SendHorizontalIcon />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
