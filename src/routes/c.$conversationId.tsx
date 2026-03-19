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
  ChatMessageAvatarFallback,
  ChatMessageAvatarImage,
  ChatMessageContainer,
  ChatMessageContent,
  ChatMessageHeader,
  ChatMessageMarkdown,
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
import {
  parseTiptapJson,
  serializeTiptapContentAsHtml,
  TiptapContent,
} from "@/components/ui/tiptap-content"
import {
  getSyncConnectionStatus,
  subscribeToSyncConnectionStatus,
} from "@/core/clientConnection"
import {
  conversationQueryKey,
  conversationQueryOptions,
  conversationsQueryKey,
} from "@/core/conversationsQuery"
import { useWorkspaceMembers } from "@/core/members"
import {
  messagesInfiniteQueryOptions,
  messagesQueryKey,
} from "@/core/messagesQuery"
import { orpcClient } from "@/core/orpcClient"
import { applyMessageCreatedToCache } from "@/core/realtimeCache"
import type { ConversationWithUserState } from "@/core/schema"
import { getScrollRestorationKey } from "@/core/scrollRestorationKey"
import type { Member } from "@luvabase/sdk"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type { JSONContent } from "@tiptap/react"
import {
  createFileRoute,
  useElementScrollRestoration,
  useNavigate,
} from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  FileIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useStickToBottom } from "use-stick-to-bottom"

export const Route = createFileRoute("/c/$conversationId")({
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

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const conversationQuery = useQuery(conversationQueryOptions(conversationId))
  const membersQuery = useWorkspaceMembers()

  const membersById = useMemo(
    () =>
      new Map<string, Member>(
        (membersQuery.data ?? []).map((member) => [member.id, member]),
      ),
    [membersQuery.data],
  )

  return (
    <ConversationView
      key={conversationId}
      conversationId={conversationId}
      conversationName={conversationQuery.data?.name ?? null}
      membersById={membersById}
    />
  )
}

function ConversationView({
  conversationId,
  conversationName,
  membersById,
}: {
  conversationId: string
  conversationName: string | null
  membersById: Map<string, Member>
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRestorationId = `conversation-messages-${conversationId}`
  const scrollRestorationEntry = useElementScrollRestoration({
    id: scrollRestorationId,
    getKey: getScrollRestorationKey,
  })

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(messagesInfiniteQueryOptions(conversationId))

  const messages = data?.messages ?? []
  const syncConnectionStatus = useSyncExternalStore(
    subscribeToSyncConnectionStatus,
    getSyncConnectionStatus,
    getSyncConnectionStatus,
  )
  const isSyncConnected = syncConnectionStatus === "connected"

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const composerRef = useRef<AppChatInputHandle>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const previousScrollHeightRef = useRef<number>(0)
  const previousMessagesLengthRef = useRef<number>(0)
  const hasInitializedScrollRef = useRef(false)
  const skipNextAutoScrollRef = useRef(false)
  const shouldAutoScrollToBottomRef = useRef(false)
  const messageArea = useStickToBottom({
    initial: false,
    resize: "smooth",
  })

  const focusComposer = () => {
    composerRef.current?.focus()
  }

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "auto") => {
    void messageArea.scrollToBottom(behavior)
  }

  const isNearBottom = () => {
    const container = messageArea.scrollRef.current
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

  const sendMessageMutation = useMutation({
    mutationFn: ({
      content,
      tiptapJson,
      attachments,
    }: {
      content: string
      tiptapJson: string | null
      attachments: File[]
    }) =>
      orpcClient.sendMessage({
        conversationId,
        content,
        tiptapJson,
        attachments,
      }),
    onSuccess: (message) => {
      applyMessageCreatedToCache(queryClient, message, {
        markViewed: true,
      })
      shouldAutoScrollToBottomRef.current = true
      composerRef.current?.clear()
      // Scroll to bottom after sending without affecting page viewport
      setTimeout(() => {
        scrollMessagesToBottom("smooth")
      }, 100)
    },
  })

  const deleteConversationMutation = useMutation({
    mutationFn: () => orpcClient.deleteConversation({ conversationId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey })

      const previousConversations = queryClient.getQueryData<
        ConversationWithUserState[]
      >(conversationsQueryKey)

      queryClient.setQueryData<ConversationWithUserState[]>(
        conversationsQueryKey,
        (conversations = []) =>
          conversations.filter(
            (conversation) => conversation.id !== conversationId,
          ),
      )

      return { previousConversations }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousConversations !== undefined) {
        queryClient.setQueryData(
          conversationsQueryKey,
          context.previousConversations,
        )
      }
    },
    onSuccess: async () => {
      queryClient.setQueryData<ConversationWithUserState[]>(
        conversationsQueryKey,
        (conversations = []) =>
          conversations.filter(
            (conversation) => conversation.id !== conversationId,
          ),
      )
      queryClient.removeQueries({
        queryKey: messagesQueryKey(conversationId),
      })
      queryClient.removeQueries({
        queryKey: conversationQueryKey(conversationId),
      })

      const remainingConversations =
        queryClient.getQueryData<ConversationWithUserState[]>(
          conversationsQueryKey,
        ) ?? []

      if (remainingConversations.length > 0) {
        const fallbackConversation = remainingConversations[0]
        if (fallbackConversation) {
          await navigate({
            to: "/c/$conversationId",
            params: { conversationId: fallbackConversation.id } as any,
            replace: true,
          })
          return
        }
      }

      await navigate({ to: "/", replace: true })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
    },
  })

  const submitMessage = (
    content: string,
    attachments: File[],
    tiptapDocument: JSONContent,
  ) => {
    if (
      !isSyncConnected ||
      sendMessageMutation.isPending ||
      (!content.trim() && attachments.length === 0)
    ) {
      return
    }

    sendMessageMutation.mutate({
      content,
      tiptapJson: content.trim() ? JSON.stringify(tiptapDocument) : null,
      attachments,
    })
  }

  // Initialize scroll once: restore prior position if available, otherwise start at bottom.
  useEffect(() => {
    const container = messageArea.scrollRef.current
    if (!container || hasInitializedScrollRef.current || !data) {
      return
    }

    if (typeof scrollRestorationEntry?.scrollY === "number") {
      container.scrollTop = scrollRestorationEntry.scrollY
      skipNextAutoScrollRef.current = true
      shouldAutoScrollToBottomRef.current = false
    } else if (messages.length > 0) {
      shouldAutoScrollToBottomRef.current = true
      scrollMessagesToBottom()
    }

    hasInitializedScrollRef.current = true
    previousMessagesLengthRef.current = messages.length
    previousScrollHeightRef.current = container.scrollHeight

    // Wait a bit before enabling infinite scroll to let scroll settle.
    setTimeout(() => {
      setIsInitialLoadComplete(true)
    }, 300)
  }, [data, messageArea.scrollRef, messages.length, scrollRestorationEntry?.scrollY])

  useEffect(() => {
    if (!data || messages.length === 0) {
      return
    }

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false
      return
    }

    ensureLatestMessageIsVisible()
  }, [data, messages.length])

  // Focus input on route switch without scrolling the page.
  useEffect(() => {
    focusComposer()
  }, [])

  // Preserve scroll position when loading older messages.
  useEffect(() => {
    const container = messageArea.scrollRef.current
    if (!container || !isInitialLoadComplete) {
      return
    }

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
  }, [isInitialLoadComplete, messageArea.scrollRef, messages.length])

  // Refresh sidebar conversation state (read/unread metadata) after message loads.
  useEffect(() => {
    if (!data) {
      return
    }
    void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
  }, [data, queryClient])

  // Infinite scroll: load more when scrolling near top.
  useEffect(() => {
    const container = messageArea.scrollRef.current
    if (!loadMoreRef.current || !container) return
    // Don't set up observer until initial load is done.
    if (!isInitialLoadComplete) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Save scroll height before fetching
          previousScrollHeightRef.current = container.scrollHeight
          fetchNextPage()
        }
      },
      {
        root: container,
        rootMargin: "50px",
        threshold: 0,
      },
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isInitialLoadComplete,
    messageArea.scrollRef,
  ])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader
        title={"#" + (conversationName ?? conversationId)}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
              aria-label="Channel options"
            >
              <EllipsisVerticalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                variant="destructive"
                disabled={deleteConversationMutation.isPending}
                onClick={() => deleteConversationMutation.mutate()}
              >
                Delete Channel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <ChatMessageArea
          instance={messageArea}
          className="min-h-0 flex-1"
        >
          <ChatMessageAreaContent
            scrollRestorationId={scrollRestorationId}
            scrollClassName="overscroll-none"
            scrollStyle={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
            className="max-w-full px-6 py-4"
          >
            {hasNextPage && (
              <div ref={loadMoreRef} className="flex justify-center py-2">
                <div className="text-sm text-muted-foreground">
                  {isFetchingNextPage ? "Loading..." : "Scroll up for more"}
                </div>
              </div>
            )}

            {messages.map((message) => {
              const author = membersById.get(message.userId)
              const authorName = author?.name ?? message.userId
              const tiptapDocument = parseTiptapJson(message.tiptapJson)

              return (
                <ChatMessage key={message.id}>
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
                      <ChatMessageTimestamp createdAt={message.createdAt} />
                    </ChatMessageHeader>
                    <ChatMessageActions>
                      <ChatMessageActionCopy
                        onClick={async () => {
                          if (message.content && tiptapDocument) {
                            const html = serializeTiptapContentAsHtml(
                              tiptapDocument,
                            )

                            if (
                              typeof ClipboardItem !== "undefined" &&
                              navigator.clipboard.write
                            ) {
                              await navigator.clipboard.write([
                                new ClipboardItem({
                                  "text/plain": new Blob([message.content], {
                                    type: "text/plain",
                                  }),
                                  "text/html": new Blob([html], {
                                    type: "text/html",
                                  }),
                                }),
                              ])
                              return
                            }
                          }

                          if (message.content) {
                            await navigator.clipboard.writeText(message.content)
                          }
                        }}
                        disabled={!message.content}
                      />
                    </ChatMessageActions>
                    {message.content || message.attachments.length > 0 ? (
                      <ChatMessageContent className="px-2 py-0">
                        {message.content
                          ? tiptapDocument
                            ? <TiptapContent content={tiptapDocument} />
                            : <ChatMessageMarkdown content={message.content} />
                          : null}
                        {message.attachments.length > 0 ? (
                          <div className="overflow-x-auto pt-1 pb-1">
                            <div className="flex gap-2">
                              {message.attachments.map((attachment) => {
                                const attachmentUrl = getAttachmentUrl(
                                  attachment.storageKey,
                                )

                                if (isImageAttachment(attachment.contentType)) {
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
                                        onLoad={() =>
                                          ensureLatestMessageIsVisible()
                                        }
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
                  </ChatMessageContainer>
                </ChatMessage>
              )
            })}
          </ChatMessageAreaContent>
          <ChatMessageAreaScrollButton />
        </ChatMessageArea>

        <div className="shrink-0 bg-background px-4 pb-5">
          <div className="flex flex-col gap-2">
            <AppChatInput
              ref={composerRef}
              onSubmit={submitMessage}
              disabled={!isSyncConnected || sendMessageMutation.isPending}
              placeholder="Jot something down"
              clearOnSubmit={false}
              allowAttachmentsWithoutText
            />
            {!isSyncConnected ? (
              <div
                className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                <span>Not connected, retrying...</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
