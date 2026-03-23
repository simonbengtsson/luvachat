import type { InfiniteData, QueryClient } from "@tanstack/react-query"
import {
  conversationQueryKey,
  conversationsQueryKey,
} from "./conversationsQuery"
import {
  conversationMessagesQueryKey,
  messagesQueryKey,
  type MessagesPage,
} from "./messagesQuery"
import type { EnrichedConversation, EnrichedMessage, ThreadPage } from "./models"
import { threadsQueryKey } from "./threadsQuery"

type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>

export function applyMessageCreatedToCache(
  queryClient: QueryClient,
  message: EnrichedMessage,
): void {
  if (message.threadRootMessageId) {
    upsertMessageInThreadCache(queryClient, message)
    void queryClient.invalidateQueries({
      queryKey: conversationMessagesQueryKey(message.conversationId),
    })
    void queryClient.invalidateQueries({ queryKey: threadsQueryKey })
  } else {
    upsertMessageInConversationCache(queryClient, message)
    updateConversationMetadata(queryClient, message)
  }
}

export function applyMessageUpdatedToCache(
  queryClient: QueryClient,
  message: EnrichedMessage,
): void {
  queryClient.setQueryData<MessagesInfiniteData>(
    messagesQueryKey(message.conversationId),
    (existing) =>
      existing
        ? {
            ...existing,
            pages: existing.pages.map((page) => ({
              ...page,
              messages: page.messages.map((existingMessage) =>
                existingMessage.id === message.id ? message : existingMessage,
              ),
            })),
          }
        : existing,
  )

  queryClient.setQueryData<EnrichedMessage[]>(
    messagesQueryKey(
      message.conversationId,
      message.threadRootMessageId ?? message.id,
    ),
    (existing) =>
      existing?.map((existingMessage) =>
        existingMessage.id === message.id ? message : existingMessage,
      ) ?? existing,
  )
}

function upsertMessageInConversationCache(
  queryClient: QueryClient,
  message: EnrichedMessage,
): void {
  queryClient.setQueryData<MessagesInfiniteData>(
    messagesQueryKey(message.conversationId),
    (existing) => {
      if (!existing) {
        return existing
      }

      const pagesWithoutMessage = existing.pages.map((page) => ({
        ...page,
        messages: page.messages.filter(
          (existingMessage) => existingMessage.id !== message.id,
        ),
      }))

      const newestPage = pagesWithoutMessage[0]
      if (!newestPage) {
        return existing
      }

      return {
        ...existing,
        pages: [
          {
            ...newestPage,
            messages: [message, ...newestPage.messages],
          },
          ...pagesWithoutMessage.slice(1),
        ],
      }
    },
  )
}

function upsertMessageInThreadCache(
  queryClient: QueryClient,
  message: EnrichedMessage,
): void {
  if (!message.threadRootMessageId) {
    return
  }

  queryClient.setQueryData<EnrichedMessage[]>(
    messagesQueryKey(message.conversationId, message.threadRootMessageId),
    (existing) => {
      if (!existing) {
        return existing
      }

      return [
        ...existing.filter((item) => item.id !== message.id),
        message,
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    },
  )
}

function updateConversationMetadata(
  queryClient: QueryClient,
  message: EnrichedMessage,
): void {
  queryClient.setQueryData<EnrichedConversation[]>(
    conversationsQueryKey,
    (conversations) =>
      conversations?.map((conversation) =>
        conversation.id === message.conversationId
          ? {
              ...conversation,
              lastMessageAt: message.createdAt,
            }
          : conversation,
      ) ?? conversations,
  )

  queryClient.setQueryData<EnrichedConversation | null>(
    conversationQueryKey(message.conversationId),
    (conversation) =>
      conversation
        ? {
            ...conversation,
            lastMessageAt: message.createdAt,
          }
        : conversation,
  )
}

export function markConversationViewedInCache(
  queryClient: QueryClient,
  conversationId: string,
  lastViewedAt: string,
): void {
  queryClient.setQueryData<EnrichedConversation[]>(
    conversationsQueryKey,
    (conversations) =>
      conversations?.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              lastViewedAt,
            }
          : conversation,
      ) ?? conversations,
  )

  queryClient.setQueryData<EnrichedConversation | null>(
    conversationQueryKey(conversationId),
    (conversation) =>
      conversation
        ? {
            ...conversation,
            lastViewedAt,
          }
        : conversation,
  )
}

export function markThreadViewedInCache(
  queryClient: QueryClient,
  threadRootMessageId: string,
): void {
  queryClient.setQueriesData<ThreadPage>(
    { queryKey: [...threadsQueryKey, "page"] },
    (threadPage) =>
      threadPage
        ? {
            ...threadPage,
            threads: threadPage.threads.map((thread) =>
              thread.id === threadRootMessageId
                ? {
                    ...thread,
                    threadIsUnread: false,
                  }
                : thread,
            ),
          }
        : threadPage,
  )
}
