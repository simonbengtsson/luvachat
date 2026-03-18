import { SiteHeader } from "@/components/site-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import type { UIMessage } from "@tanstack/ai-client"
import { fetchServerSentEvents, generateMessageId } from "@tanstack/ai-client"
import { useChat } from "@tanstack/ai-react"
import { createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SquareIcon,
} from "lucide-react"
import type { KeyboardEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

export const Route = createFileRoute("/aichat")({
  component: RouteComponent,
})

function createInitialMessages(): Array<UIMessage> {
  return [
    {
      id: generateMessageId(),
      role: "assistant",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
  ]
}

function formatMessageTimestamp(value?: Date | string) {
  if (!value) {
    return ""
  }

  const date = value instanceof Date ? value : new Date(value)
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

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("")
}

function RouteComponent() {
  const conversationId = useRef(crypto.randomUUID())
  const initialMessages = useMemo(() => createInitialMessages(), [])
  const [messageContent, setMessageContent] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const hasInitializedScrollRef = useRef(false)
  const shouldAutoScrollToBottomRef = useRef(false)

  const { messages, sendMessage, setMessages, stop, isLoading, error } =
    useChat({
      id: "aichat",
      initialMessages,
      onError: (error) => {
        console.error("AI chat error", error)
      },
      connection: fetchServerSentEvents("/api/aichat", () => {
        return {
          body: {
            conversationId: conversationId.current,
          },
        }
      }),
    })

  const focusComposer = () => {
    textareaRef.current?.focus({ preventScroll: true })
  }

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "auto") => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
  }

  const isNearBottom = () => {
    const container = scrollContainerRef.current
    if (!container) {
      return false
    }

    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      120
    )
  }

  const ensureLatestMessageIsVisible = (behavior: ScrollBehavior = "auto") => {
    if (!shouldAutoScrollToBottomRef.current && !isNearBottom()) {
      return
    }

    requestAnimationFrame(() => {
      scrollMessagesToBottom(behavior)
    })
  }

  const submitMessage = () => {
    const content = messageContent.trim()
    if (!content || isLoading) {
      return
    }

    shouldAutoScrollToBottomRef.current = true
    setMessageContent("")
    void sendMessage(content)
    focusComposer()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submitMessage()
    }
  }

  const resetChat = () => {
    stop()
    setMessages(createInitialMessages())
    setMessageContent("")
    shouldAutoScrollToBottomRef.current = true
    focusComposer()
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || hasInitializedScrollRef.current) {
      return
    }

    shouldAutoScrollToBottomRef.current = true
    scrollMessagesToBottom()
    hasInitializedScrollRef.current = true
  }, [messages.length])

  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    ensureLatestMessageIsVisible(isLoading ? "auto" : "smooth")
  }, [isLoading, messages])

  useEffect(() => {
    if (!error) {
      return
    }

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "assistant") {
      return
    }

    if (getMessageText(lastMessage).trim()) {
      return
    }

    setMessages(messages.slice(0, -1))
  }, [error, messages, setMessages])

  useEffect(() => {
    focusComposer()
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader
        title="AI Chat"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
              aria-label="AI chat options"
            >
              <EllipsisVerticalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={resetChat}>
                <RotateCcwIcon className="size-4" />
                New Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overscroll-none"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div className="max-w-full space-y-4 px-6 py-4">
            {messages.map((message, index) => {
              const messageText = getMessageText(message)
              const isAssistant = message.role === "assistant"
              const isStreamingPlaceholder =
                isAssistant &&
                isLoading &&
                index === messages.length - 1 &&
                messageText.length === 0

              return (
                <div
                  key={message.id}
                  className="group/message relative flex gap-3 rounded-xl px-2 py-2 hover:bg-muted/40"
                >
                  <Avatar className="mt-0.5 size-9">
                    <AvatarFallback className="text-xs">
                      {isAssistant ? "AI" : "YU"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">
                        {isAssistant ? "Luvachat AI" : "You"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMessageTimestamp(message.createdAt)}
                      </span>
                    </div>
                    {messageText ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {messageText}
                      </div>
                    ) : null}
                    {isStreamingPlaceholder ? (
                      <div
                        className="flex items-center gap-1.5 text-sm text-muted-foreground"
                        aria-live="polite"
                      >
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="shrink-0 bg-background px-4 pb-5">
          <div className="flex flex-col gap-2">
            <div className="w-full rounded-2xl border border-border/70 bg-card shadow-sm">
              <Textarea
                ref={textareaRef}
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything"
                rows={1}
                className="min-h-0 resize-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-end border-t border-border/70 px-2 py-2">
                {isLoading ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    className="rounded-full"
                    onClick={stop}
                    aria-label="Stop response"
                  >
                    <SquareIcon className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    onClick={submitMessage}
                    size="icon-sm"
                    className="rounded-full"
                    disabled={!messageContent.trim()}
                    aria-label="Send message"
                  >
                    <SendHorizontalIcon />
                  </Button>
                )}
              </div>
            </div>
            {isLoading ? (
              <div
                className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                <span>Generating response...</span>
              </div>
            ) : null}
            {error ? (
              <div className="px-1 text-xs text-destructive" role="alert">
                {error.message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
