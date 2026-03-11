import { Button } from "@/components/ui/button"
import { SiteHeader } from "@/components/site-header"
import { Textarea } from "@/components/ui/textarea"
import { conversationsQueryOptions } from "@/core/conversationsQuery"
import { messagesInfiniteQueryOptions } from "@/core/messagesQuery"
import { sendMessage } from "@/core/functions"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

export const Route = createFileRoute("/c/$conversationId")({
  component: RouteComponent,
})

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const { data: conversations = [] } = useQuery(conversationsQueryOptions())

  return (
    <>
      {conversations.map((conversation) => (
        <ConversationView
          key={conversation.id}
          conversationId={conversation.id}
          conversationName={conversation.name}
          isActive={conversation.id === conversationId}
        />
      ))}
    </>
  )
}

function ConversationView({
  conversationId,
  conversationName,
  isActive,
}: {
  conversationId: string
  conversationName: string | null
  isActive: boolean
}) {
  const queryClient = useQueryClient()

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(messagesInfiniteQueryOptions(conversationId))

  const messages = data?.messages ?? []

  const [messageContent, setMessageContent] = useState("")
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const previousScrollHeightRef = useRef<number>(0)
  const previousMessagesLengthRef = useRef<number>(0)
  const hasScrolledToBottomRef = useRef(false)

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) =>
      sendMessage({
        data: {
          conversationId,
          content,
          authorId: "user-1", // TODO: Get actual user ID
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["messages", conversationId],
      })
      setMessageContent("")
      textareaRef.current?.focus()
      // Scroll to bottom after sending
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 100)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (messageContent.trim()) {
      sendMessageMutation.mutate(messageContent)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Scroll to bottom on initial load only (once per conversation view)
  useEffect(() => {
    if (!hasScrolledToBottomRef.current && messages.length > 0 && isActive) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
      hasScrolledToBottomRef.current = true
      previousMessagesLengthRef.current = messages.length
      // Wait a bit before enabling infinite scroll to let scroll settle
      setTimeout(() => {
        setIsInitialLoadComplete(true)
      }, 300)
    }
  }, [messages.length, isActive])

  // Focus input when becoming active
  useEffect(() => {
    if (isActive) {
      textareaRef.current?.focus()
    }
  }, [isActive])

  // Preserve scroll position when loading older messages
  useEffect(() => {
    if (!scrollContainerRef.current || !isInitialLoadComplete) return

    const container = scrollContainerRef.current
    const currentMessagesLength = messages.length
    const previousMessagesLength = previousMessagesLengthRef.current

    // If messages increased (older messages loaded)
    if (currentMessagesLength > previousMessagesLength && previousMessagesLength > 0) {
      const previousScrollHeight = previousScrollHeightRef.current
      const currentScrollHeight = container.scrollHeight

      // Maintain scroll position by adjusting for new content height
      const scrollHeightDiff = currentScrollHeight - previousScrollHeight
      container.scrollTop = container.scrollTop + scrollHeightDiff
    }

    previousMessagesLengthRef.current = currentMessagesLength
    previousScrollHeightRef.current = container.scrollHeight
  }, [messages.length, isInitialLoadComplete])

  // Infinite scroll: load more when scrolling near top
  useEffect(() => {
    if (!loadMoreRef.current || !scrollContainerRef.current) return
    // Don't set up observer until initial load is done
    if (!isInitialLoadComplete) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Save scroll height before fetching
          if (scrollContainerRef.current) {
            previousScrollHeightRef.current = scrollContainerRef.current.scrollHeight
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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isInitialLoadComplete])

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

            {messages.map((message) => (
              <div key={message.id} className="flex flex-col space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">
                  {message.authorId}
                </div>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Fixed input at bottom */}
        <div className="shrink-0 border-t bg-background p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${conversationName ?? conversationId}`}
              className="min-h-16 flex-1"
              autoFocus
            />
            <Button
              type="submit"
              disabled={!messageContent.trim() || sendMessageMutation.isPending}
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
