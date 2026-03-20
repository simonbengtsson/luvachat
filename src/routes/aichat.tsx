import {
  AppChatInput,
  type AppChatInputHandle,
} from "@/components/app-chat-input"
import { SiteHeader } from "@/components/site-header"
import {
  ChatMessage,
  ChatMessageActionCopy,
  ChatMessageActions,
  ChatMessageAuthor,
  ChatMessageAvatar,
  ChatMessageAvatarAssistantIcon,
  ChatMessageAvatarFallback,
  ChatMessageAvatarUserIcon,
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
  ChatMessageArea,
  ChatMessageAreaContent,
  ChatMessageAreaScrollButton,
} from "@/components/ui/chat-message-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkspaceMembers } from "@/core/members"
import type { UIMessage } from "@tanstack/ai-client"
import { fetchServerSentEvents, generateMessageId } from "@tanstack/ai-client"
import { useChat } from "@tanstack/ai-react"
import { createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

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
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "assistant",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "I'm here to help you with your questions.",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
      createdAt: new Date(),
      parts: [
        {
          type: "text",
          content: "Hello, how can I help you today?",
        },
      ],
    },
    {
      id: generateMessageId(),
      role: "user",
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

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("")
}

function RouteComponent() {
  const conversationId = useRef(crypto.randomUUID())
  const initialMessages = useMemo(() => createInitialMessages(), [])
  const composerRef = useRef<AppChatInputHandle>(null)
  const membersQuery = useWorkspaceMembers()
  const members = membersQuery.data ?? []

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
    composerRef.current?.focus()
  }

  const submitMessage = (content: string) => {
    const trimmedContent = content.trim()
    if (!trimmedContent || isLoading) {
      return
    }

    void sendMessage(trimmedContent)
    focusComposer()
  }

  const resetChat = () => {
    stop()
    setMessages(createInitialMessages())
    composerRef.current?.clear()
  }

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

  const lastMessage = messages[messages.length - 1]
  const showOptimisticAssistantMessage =
    isLoading && (!lastMessage || lastMessage.role !== "assistant")
  const lastDummyMessageIndex = initialMessages.length - 1

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
        <ChatMessageArea className="min-h-0 flex-1 overscroll-none">
          <ChatMessageAreaContent className="max-w-full px-6 py-4">
            {messages.map((message, index) => {
              const messageText = getMessageText(message)
              const isAssistant = message.role === "assistant"
              const showThreadPreview = index === lastDummyMessageIndex
              const isStreamingPlaceholder =
                isAssistant &&
                isLoading &&
                index === messages.length - 1 &&
                messageText.length === 0

              return (
                <ChatMessage key={message.id}>
                  <ChatMessageAvatar className="mt-0.5 size-9">
                    <ChatMessageAvatarFallback className="text-xs">
                      {isAssistant ? (
                        <ChatMessageAvatarAssistantIcon />
                      ) : (
                        <ChatMessageAvatarUserIcon />
                      )}
                    </ChatMessageAvatarFallback>
                  </ChatMessageAvatar>
                  <ChatMessageContainer>
                    <ChatMessageHeader>
                      <ChatMessageAuthor>
                        {isAssistant ? "Luvachat AI" : "You"}
                      </ChatMessageAuthor>
                      {message.createdAt ? (
                        <ChatMessageTimestamp createdAt={message.createdAt} />
                      ) : null}
                    </ChatMessageHeader>
                    <ChatMessageActions>
                      <ChatMessageActionCopy
                        onClick={() => {
                          if (messageText) {
                            navigator.clipboard.writeText(messageText)
                          }
                        }}
                        disabled={!messageText}
                      />
                    </ChatMessageActions>
                    {messageText ? (
                      <ChatMessageContent className="px-2 py-0">
                        <ChatMessageMarkdown content={messageText} />
                      </ChatMessageContent>
                    ) : null}
                    {showThreadPreview ? (
                      <ChatMessageFooter className="px-2 pt-1">
                        <ChatMessageThread type="button">
                          <ChatMessageThreadReplyCount>
                            1 reply
                          </ChatMessageThreadReplyCount>
                          <ChatMessageThreadTimestamp
                            date={message.createdAt ?? new Date()}
                          />
                          <ChatMessageThreadAction />
                        </ChatMessageThread>
                      </ChatMessageFooter>
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
                  </ChatMessageContainer>
                </ChatMessage>
              )
            })}
            {showOptimisticAssistantMessage ? (
              <ChatMessage>
                <ChatMessageAvatar className="mt-0.5 size-9">
                  <ChatMessageAvatarFallback className="text-xs">
                    <ChatMessageAvatarAssistantIcon />
                  </ChatMessageAvatarFallback>
                </ChatMessageAvatar>
                <ChatMessageContainer>
                  <ChatMessageHeader>
                    <ChatMessageAuthor>Luvachat AI</ChatMessageAuthor>
                    <ChatMessageTimestamp createdAt={new Date()} />
                  </ChatMessageHeader>
                  <div
                    className="flex items-center gap-1.5 text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </ChatMessageContainer>
              </ChatMessage>
            ) : null}
          </ChatMessageAreaContent>
          <ChatMessageAreaScrollButton />
        </ChatMessageArea>

        <div className="shrink-0 bg-background px-4 pb-5">
          <div className="flex flex-col gap-2">
            <AppChatInput
              ref={composerRef}
              onSubmit={submitMessage}
              members={members}
              onStop={stop}
              isStreaming={isLoading}
              placeholder="Ask anything"
              attachmentsHelperText="Attachments are selected locally only in AI chat for now."
              autoFocus
            />
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
