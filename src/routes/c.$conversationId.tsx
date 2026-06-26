import { ConversationReplyInput } from "@/components/conversation-reply-input"
import { SiteHeader } from "@/components/site-header"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  ChatMessage,
  ChatMessageAction,
  ChatMessageActionCopy,
  ChatMessageActions,
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
import { activityQueryKey } from "@/core/activityQuery"
import {
  getSyncConnectionStatus,
  subscribeToSyncConnectionStatus,
} from "@/core/clientConnection"
import { getConversationDisplayName } from "@/core/conversationDisplay"
import { conversationSearchSchema } from "@/core/conversationSearch"
import {
  conversationQueryKey,
  conversationQueryOptions,
  conversationsQueryKey,
} from "@/core/conversationsQuery"
import type { Member } from "@/core/luvabase"
import { useWorkspaceMembers } from "@/core/members"
import {
  conversationMessagesQueryKey,
  messagesInfiniteQueryOptions,
  threadMessagesQueryOptions,
} from "@/core/messagesQuery"
import type { EnrichedConversation, EnrichedMessage } from "@/core/models"
import { orpcClient } from "@/core/orpcClient"
import {
  applyMessageUpdatedToCache,
  markConversationViewedInCache,
  markThreadViewedInCache,
  updateConversationNotificationLevelInCache,
} from "@/core/realtimeCache"
import { getScrollRestorationKey } from "@/core/scrollRestorationKey"
import { threadsQueryKey } from "@/core/threadsQuery"
import { useIsTouchDevice } from "@/hooks/use-touch-device"
import { cn } from "@/lib/utils"
import { getSession } from "@/route.functions"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ClientOnly,
  createFileRoute,
  Link,
  Outlet,
  useElementScrollRestoration,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router"
import type { JSONContent } from "@tiptap/react"
import {
  ArrowLeftIcon,
  BellOffIcon,
  EllipsisVerticalIcon,
  FileIcon,
  MessageSquareTextIcon,
  SearchIcon,
  SmileIcon,
} from "lucide-react"
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useStickToBottom } from "use-stick-to-bottom"

const EmojiPicker = lazy(() => import("@/components/shadcnblocks/emoji-picker"))

export const Route = createFileRoute("/c/$conversationId")({
  validateSearch: conversationSearchSchema,
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

function subscribeToDocumentVisibility(listener: () => void) {
  if (typeof document === "undefined") {
    return () => {}
  }

  document.addEventListener("visibilitychange", listener)
  return () => {
    document.removeEventListener("visibilitychange", listener)
  }
}

function getDocumentVisibilityState() {
  if (typeof document === "undefined") {
    return "visible"
  }

  return document.visibilityState
}

function subscribeToWindowFocus(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  window.addEventListener("focus", listener)
  window.addEventListener("blur", listener)

  return () => {
    window.removeEventListener("focus", listener)
    window.removeEventListener("blur", listener)
  }
}

function getWindowFocusState() {
  if (typeof window === "undefined") {
    return true
  }

  return window.document.hasFocus()
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

async function copyMessageContent(
  content: string,
  tiptapDocument: JSONContent | null,
) {
  if (content && tiptapDocument) {
    const html = serializeTiptapContentAsHtml(tiptapDocument)

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([content], {
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

  if (content) {
    await navigator.clipboard.writeText(content)
  }
}

function MessageReactionPicker({
  onEmojiSelect,
}: {
  onEmojiSelect: (emoji: string) => void
}) {
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="h-7 w-7"
      aria-label="Add reaction"
    >
      <SmileIcon className="size-4" />
    </Button>
  )

  return (
    <ClientOnly fallback={trigger}>
      <Suspense fallback={trigger}>
        <EmojiPicker onEmojiSelect={onEmojiSelect} trigger={trigger} />
      </Suspense>
    </ClientOnly>
  )
}

function MessageReactionChips({
  reactions,
  onToggleReaction,
}: {
  reactions: EnrichedMessage["reactions"]
  onToggleReaction: (emoji: string) => void
}) {
  if (reactions.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-2">
      {reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          type="button"
          variant={reaction.reactedByCurrentUser ? "secondary" : "outline"}
          size="xs"
          className={cn(
            "h-7 rounded-full px-2.5 text-xs",
            reaction.reactedByCurrentUser && "border border-border/70",
          )}
          onClick={() => onToggleReaction(reaction.emoji)}
          aria-label={`Toggle ${reaction.emoji} reaction`}
        >
          <span className="text-sm leading-none">{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </Button>
      ))}
    </div>
  )
}

function RouteComponent() {
  const { conversationId } = Route.useParams()
  const matchRoute = useMatchRoute()
  const search = Route.useSearch()
  const conversationQuery = useQuery(conversationQueryOptions(conversationId))
  const sessionQuery = useQuery({
    queryKey: ["conversation-session"],
    queryFn: () => getSession(),
  })
  const membersQuery = useWorkspaceMembers()
  const members = membersQuery.data ?? []
  const threadMessageId = search.thread || undefined

  const membersById = useMemo(
    () => new Map<string, Member>(members.map((member) => [member.id, member])),
    [members],
  )
  const conversation = conversationQuery.data
  const currentUserId = sessionQuery.data?.id
  const conversationTitle =
    conversation && currentUserId
      ? getConversationDisplayName(conversation, currentUserId, membersById)
      : (conversation?.name ?? conversationId)
  const isReplyRoute = Boolean(
    matchRoute({
      to: "/c/$conversationId/reply",
      params: { conversationId },
    }),
  )

  if (isReplyRoute) {
    return <Outlet />
  }

  return (
    <ConversationView
      key={`${conversationId}:${threadMessageId ?? "root"}`}
      conversationId={conversationId}
      conversationType={conversationQuery.data?.type ?? null}
      conversationTitle={conversationTitle}
      conversationNotificationLevel={
        conversationQuery.data?.notificationLevel ?? "all"
      }
      threadMessageId={threadMessageId}
      members={members}
      membersById={membersById}
    />
  )
}

function ConversationView({
  conversationId,
  conversationType,
  conversationTitle,
  conversationNotificationLevel,
  threadMessageId,
  members,
  membersById,
}: {
  conversationId: string
  conversationType: string | null
  conversationTitle: string
  conversationNotificationLevel: EnrichedConversation["notificationLevel"]
  threadMessageId?: string
  members: Member[]
  membersById: Map<string, Member>
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isThreadView = !!threadMessageId
  const isTouchDevice = useIsTouchDevice()
  const conversationSearch = threadMessageId ? { thread: threadMessageId } : {}
  const scrollRestorationId = `conversation-messages-${conversationId}-${threadMessageId ?? "root"}`
  const scrollRestorationEntry = useElementScrollRestoration({
    id: scrollRestorationId,
    getKey: getScrollRestorationKey,
  })

  const {
    data: rootMessagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...messagesInfiniteQueryOptions(conversationId),
    enabled: !isThreadView,
  })
  const threadMessagesQuery = useQuery({
    ...threadMessagesQueryOptions(conversationId, threadMessageId ?? ""),
    enabled: isThreadView,
  })

  const messages = isThreadView
    ? (threadMessagesQuery.data ?? [])
    : (rootMessagesData?.messages ?? [])
  const hasLoadedMessages = isThreadView
    ? threadMessagesQuery.isSuccess
    : !!rootMessagesData
  const syncConnectionStatus = useSyncExternalStore(
    subscribeToSyncConnectionStatus,
    getSyncConnectionStatus,
    getSyncConnectionStatus,
  )
  const documentVisibilityState = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibilityState,
    getDocumentVisibilityState,
  )
  const windowHasFocus = useSyncExternalStore(
    subscribeToWindowFocus,
    getWindowFocusState,
    getWindowFocusState,
  )
  const isSyncConnected = syncConnectionStatus === "connected"

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const lastPersistedViewedMessageIdRef = useRef<string | null>(null)
  const previousScrollHeightRef = useRef<number>(0)
  const previousMessagesLengthRef = useRef<number>(0)
  const hasInitializedScrollRef = useRef(false)
  const skipNextAutoScrollRef = useRef(false)
  const shouldAutoScrollToBottomRef = useRef(false)
  const messageArea = useStickToBottom({
    initial: false,
    resize: "smooth",
  })

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

  const markConversationViewedMutation = useMutation({
    mutationFn: (_input: { lastViewedAt: string; messageId: string }) =>
      orpcClient.markConversationViewed({ conversationId }),
    onMutate: ({ lastViewedAt }) => {
      markConversationViewedInCache(queryClient, conversationId, lastViewedAt)
    },
    onError: () => {
      lastPersistedViewedMessageIdRef.current = null
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
      void queryClient.invalidateQueries({
        queryKey: conversationQueryKey(conversationId),
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: activityQueryKey })
      void queryClient.invalidateQueries({ queryKey: threadsQueryKey })
    },
  })

  const markThreadViewedMutation = useMutation({
    mutationFn: () => {
      if (!threadMessageId) {
        return Promise.resolve()
      }

      return orpcClient.markThreadViewed({
        conversationId,
        threadRootMessageId: threadMessageId,
      })
    },
    onMutate: () => {
      if (!threadMessageId) {
        return
      }

      markThreadViewedInCache(queryClient, threadMessageId)
    },
    onError: () => {
      lastPersistedViewedMessageIdRef.current = null
      void queryClient.invalidateQueries({ queryKey: threadsQueryKey })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: activityQueryKey })
      void queryClient.invalidateQueries({ queryKey: threadsQueryKey })
    },
  })

  const deleteConversationMutation = useMutation({
    mutationFn: () => orpcClient.deleteConversation({ conversationId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey })

      const previousConversations = queryClient.getQueryData<
        EnrichedConversation[]
      >(conversationsQueryKey)

      queryClient.setQueryData<EnrichedConversation[]>(
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
      queryClient.setQueryData<EnrichedConversation[]>(
        conversationsQueryKey,
        (conversations = []) =>
          conversations.filter(
            (conversation) => conversation.id !== conversationId,
          ),
      )
      queryClient.removeQueries({
        queryKey: conversationMessagesQueryKey(conversationId),
      })
      queryClient.removeQueries({
        queryKey: conversationQueryKey(conversationId),
      })

      const remainingConversations =
        queryClient.getQueryData<EnrichedConversation[]>(
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
  const isConversationMuted = conversationNotificationLevel === "muted"
  const setConversationNotificationLevelMutation = useMutation({
    mutationFn: (
      notificationLevel: EnrichedConversation["notificationLevel"],
    ) =>
      orpcClient.setConversationNotificationLevel({
        conversationId,
        notificationLevel,
      }),
    onMutate: async (notificationLevel) => {
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey })
      await queryClient.cancelQueries({
        queryKey: conversationQueryKey(conversationId),
      })

      const previousConversations = queryClient.getQueryData<
        EnrichedConversation[]
      >(conversationsQueryKey)
      const previousConversation =
        queryClient.getQueryData<EnrichedConversation | null>(
          conversationQueryKey(conversationId),
        )

      updateConversationNotificationLevelInCache(
        queryClient,
        conversationId,
        notificationLevel,
      )

      return {
        previousConversations,
        previousConversation,
      }
    },
    onError: (_error, _notificationLevel, context) => {
      if (context?.previousConversations !== undefined) {
        queryClient.setQueryData(
          conversationsQueryKey,
          context.previousConversations,
        )
      }

      if (context?.previousConversation !== undefined) {
        queryClient.setQueryData(
          conversationQueryKey(conversationId),
          context.previousConversation,
        )
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
      void queryClient.invalidateQueries({
        queryKey: conversationQueryKey(conversationId),
      })
    },
  })

  const toggleMessageReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      orpcClient.toggleMessageReaction({ messageId, emoji }),
    onSuccess: (message) => {
      applyMessageUpdatedToCache(queryClient, message)
      void queryClient.invalidateQueries({ queryKey: activityQueryKey })
    },
  })

  const openThread = (messageId: string) => {
    navigate({
      to: "/c/$conversationId",
      params: { conversationId } as any,
      search: { thread: messageId },
    })
  }

  const closeThread = () => {
    navigate({
      to: "/c/$conversationId",
      params: { conversationId } as any,
      search: {},
    })
  }

  const toggleMessageReaction = (messageId: string, emoji: string) => {
    if (!isSyncConnected) {
      return
    }

    toggleMessageReactionMutation.mutate({ messageId, emoji })
  }

  // Initialize scroll once: restore prior position if available, otherwise start at bottom.
  useEffect(() => {
    const container = messageArea.scrollRef.current
    if (!container || hasInitializedScrollRef.current || !hasLoadedMessages) {
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
  }, [
    hasLoadedMessages,
    messageArea.scrollRef,
    messages.length,
    scrollRestorationEntry?.scrollY,
  ])

  useEffect(() => {
    if (!hasLoadedMessages || messages.length === 0) {
      return
    }

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false
      return
    }

    ensureLatestMessageIsVisible()
  }, [hasLoadedMessages, messages.length])

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
    if (!hasLoadedMessages) {
      return
    }
    void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
  }, [hasLoadedMessages, queryClient])

  // Infinite scroll: load more when scrolling near top.
  useEffect(() => {
    const container = messageArea.scrollRef.current
    if (isThreadView) return
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
    isThreadView,
    isFetchingNextPage,
    isInitialLoadComplete,
    messageArea.scrollRef,
  ])

  const threadRootMessage = threadMessageId
    ? (messages.find((message) => message.id === threadMessageId) ?? null)
    : null
  const latestViewedMessage = messages[messages.length - 1] ?? null
  const threadRootTiptapDocument = threadRootMessage
    ? parseTiptapJson(threadRootMessage.tiptapJson)
    : null
  const displayedMessages =
    isThreadView && threadMessageId
      ? messages.filter((message) => message.id !== threadMessageId)
      : messages
  const composerPlaceholder = isThreadView
    ? "Reply in thread"
    : "Jot something down"

  useEffect(() => {
    if (
      !latestViewedMessage ||
      documentVisibilityState !== "visible" ||
      !windowHasFocus
    ) {
      return
    }

    if (lastPersistedViewedMessageIdRef.current === latestViewedMessage.id) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      lastPersistedViewedMessageIdRef.current = latestViewedMessage.id

      if (isThreadView) {
        markThreadViewedMutation.mutate()
        return
      }

      markConversationViewedMutation.mutate({
        lastViewedAt: latestViewedMessage.createdAt,
        messageId: latestViewedMessage.id,
      })
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    documentVisibilityState,
    isThreadView,
    latestViewedMessage,
    markConversationViewedMutation,
    markThreadViewedMutation,
    windowHasFocus,
  ])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SiteHeader
        title={`${isThreadView ? "Thread: " : ""}${
          conversationType === "channel"
            ? "#" + conversationTitle
            : conversationTitle
        }`}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                void navigate({
                  to: "/search",
                  search: { conversationId },
                })
              }}
              aria-label={`Search in ${
                conversationType === "channel"
                  ? `#${conversationTitle}`
                  : conversationTitle
              }`}
            >
              <SearchIcon className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
                aria-label="Conversation options"
              >
                <EllipsisVerticalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem
                  disabled={setConversationNotificationLevelMutation.isPending}
                  onClick={() =>
                    setConversationNotificationLevelMutation.mutate(
                      isConversationMuted ? "all" : "muted",
                    )
                  }
                >
                  <BellOffIcon className="size-4" />
                  {isConversationMuted
                    ? "Unmute Notifications"
                    : "Mute Notifications"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={
                    deleteConversationMutation.isPending ||
                    setConversationNotificationLevelMutation.isPending
                  }
                  onClick={() => deleteConversationMutation.mutate()}
                >
                  {conversationType === "channel"
                    ? "Delete Channel"
                    : "Delete Conversation"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <ChatMessageArea instance={messageArea} className="min-h-0 flex-1">
          <ChatMessageAreaContent
            scrollRestorationId={scrollRestorationId}
            scrollStyle={{
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorX: "auto",
              overscrollBehaviorY: "contain",
            }}
            className={cn(
              "max-w-full px-6 pt-6 pb-4",
              isTouchDevice && "pb-24",
            )}
          >
            {!isThreadView && hasNextPage && (
              <div ref={loadMoreRef} className="flex justify-center py-2">
                <div className="text-sm text-muted-foreground">
                  {isFetchingNextPage ? "Loading..." : "Scroll up for more"}
                </div>
              </div>
            )}

            {isThreadView && hasLoadedMessages && !threadRootMessage ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                Thread not found.
              </div>
            ) : null}

            {isThreadView && threadRootMessage ? (
              <div className="mb-5 space-y-3">
                <div>
                  <Button variant="ghost" size="sm" onClick={closeThread}>
                    <ArrowLeftIcon className="size-4" />
                    All messages
                  </Button>
                </div>
                <ChatMessage className="rounded-xl border border-border/70 bg-muted/20">
                  <ChatMessageAvatar className="mt-0.5 size-9">
                    <ChatMessageAvatarImage
                      src={
                        membersById.get(threadRootMessage.userId)?.imageUrl ??
                        undefined
                      }
                      alt={
                        membersById.get(threadRootMessage.userId)?.name ??
                        threadRootMessage.userId
                      }
                    />
                    <ChatMessageAvatarFallback className="text-xs">
                      {getInitials(
                        membersById.get(threadRootMessage.userId)?.name ??
                          threadRootMessage.userId,
                      )}
                    </ChatMessageAvatarFallback>
                  </ChatMessageAvatar>
                  <ChatMessageContainer>
                    <ChatMessageHeader>
                      <ChatMessageAuthor>
                        {membersById.get(threadRootMessage.userId)?.name ??
                          threadRootMessage.userId}
                      </ChatMessageAuthor>
                      <ChatMessageTimestamp
                        createdAt={threadRootMessage.createdAt}
                      />
                    </ChatMessageHeader>
                    <ChatMessageActions>
                      <MessageReactionPicker
                        onEmojiSelect={(emoji) =>
                          toggleMessageReaction(threadRootMessage.id, emoji)
                        }
                      />
                      <ChatMessageActionCopy
                        onClick={() =>
                          copyMessageContent(
                            threadRootMessage.content,
                            threadRootTiptapDocument,
                          )
                        }
                        disabled={!threadRootMessage.content}
                      />
                    </ChatMessageActions>
                    {threadRootMessage.content ||
                    threadRootMessage.attachments.length > 0 ? (
                      <ChatMessageContent className="px-2 py-0">
                        {threadRootMessage.content ? (
                          threadRootTiptapDocument ? (
                            <TiptapContent content={threadRootTiptapDocument} />
                          ) : (
                            <ChatMessageMarkdown
                              content={threadRootMessage.content}
                            />
                          )
                        ) : null}
                        {threadRootMessage.attachments.length > 0 ? (
                          <div className="overflow-x-auto pt-1 pb-1">
                            <div className="flex gap-2">
                              {threadRootMessage.attachments.map(
                                (attachment) => {
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
                                },
                              )}
                            </div>
                          </div>
                        ) : null}
                      </ChatMessageContent>
                    ) : null}
                    <MessageReactionChips
                      reactions={threadRootMessage.reactions}
                      onToggleReaction={(emoji) =>
                        toggleMessageReaction(threadRootMessage.id, emoji)
                      }
                    />
                  </ChatMessageContainer>
                </ChatMessage>
              </div>
            ) : null}

            {displayedMessages.map((message) => {
              const author = membersById.get(message.userId)
              const authorName = author?.name ?? message.userId
              const tiptapDocument = parseTiptapJson(message.tiptapJson)
              const threadReplyLabel =
                message.threadReplyCount === 1
                  ? "1 reply"
                  : `${message.threadReplyCount} replies`

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
                      <MessageReactionPicker
                        onEmojiSelect={(emoji) =>
                          toggleMessageReaction(message.id, emoji)
                        }
                      />
                      {!message.threadRootMessageId ? (
                        <ChatMessageAction
                          label="Open thread"
                          onClick={() => openThread(message.id)}
                        >
                          <MessageSquareTextIcon className="size-4" />
                        </ChatMessageAction>
                      ) : null}
                      <ChatMessageActionCopy
                        onClick={() =>
                          copyMessageContent(message.content, tiptapDocument)
                        }
                        disabled={!message.content}
                      />
                    </ChatMessageActions>
                    {message.content || message.attachments.length > 0 ? (
                      <ChatMessageContent className="px-2 py-0">
                        {message.content ? (
                          tiptapDocument ? (
                            <TiptapContent content={tiptapDocument} />
                          ) : (
                            <ChatMessageMarkdown content={message.content} />
                          )
                        ) : null}
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
                    <MessageReactionChips
                      reactions={message.reactions}
                      onToggleReaction={(emoji) =>
                        toggleMessageReaction(message.id, emoji)
                      }
                    />
                    {!message.threadRootMessageId &&
                    message.threadReplyCount > 0 ? (
                      <ChatMessageFooter className="px-2 pt-0">
                        <ChatMessageThread
                          type="button"
                          onClick={() => openThread(message.id)}
                        >
                          <ChatMessageThreadReplyCount>
                            {threadReplyLabel}
                          </ChatMessageThreadReplyCount>
                          {message.threadLastReplyAt ? (
                            <ChatMessageThreadTimestamp
                              date={message.threadLastReplyAt}
                            />
                          ) : null}
                          <ChatMessageThreadAction />
                        </ChatMessageThread>
                      </ChatMessageFooter>
                    ) : null}
                  </ChatMessageContainer>
                </ChatMessage>
              )
            })}
          </ChatMessageAreaContent>
          <ChatMessageAreaScrollButton />
        </ChatMessageArea>

        {isTouchDevice ? (
          <div className="pointer-events-none fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-20">
            <Link
              to="/c/$conversationId/reply"
              params={{ conversationId }}
              search={conversationSearch}
              preload="intent"
              className={cn(
                buttonVariants({ size: "lg" }),
                "pointer-events-auto rounded-full px-4 shadow-lg",
              )}
            >
              <MessageSquareTextIcon className="size-4" />
              New
            </Link>
          </div>
        ) : (
          <div className="shrink-0 bg-background px-4 pb-5">
            <ConversationReplyInput
              conversationId={conversationId}
              threadMessageId={threadMessageId}
              members={members}
              placeholder={composerPlaceholder}
              autoFocus
              onMessageSent={(message) => {
                lastPersistedViewedMessageIdRef.current = message.id
                shouldAutoScrollToBottomRef.current = true
                setTimeout(() => {
                  scrollMessagesToBottom("smooth")
                }, 100)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
