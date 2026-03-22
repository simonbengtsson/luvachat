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
import type { ConversationWithUserState, EnrichedMessage } from "./models"

type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>

export function applyMessageCreatedToCache(
  queryClient: QueryClient,
  message: EnrichedMessage,
  options?: { markViewed?: boolean },
): void {
  if (message.parentMessageId) {
    upsertMessageInThreadCache(queryClient, message)
    void queryClient.invalidateQueries({
      queryKey: conversationMessagesQueryKey(message.conversationId),
    })
  } else {
    upsertMessageInConversationCache(queryClient, message)
  }

  updateConversationMetadata(queryClient, message, options?.markViewed ?? false)
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
  if (!message.parentMessageId) {
    return
  }

  queryClient.setQueryData<EnrichedMessage[]>(
    messagesQueryKey(message.conversationId, message.parentMessageId),
    (existing) => {
      if (!existing) {
        return existing
      }

      return [...existing.filter((item) => item.id !== message.id), message].sort(
        (left, right) => left.createdAt.localeCompare(right.createdAt),
      )
    },
  )
}

function updateConversationMetadata(
  queryClient: QueryClient,
  message: EnrichedMessage,
  markViewed: boolean,
): void {
  if (message.parentMessageId) {
    return
  }

  queryClient.setQueryData<ConversationWithUserState[]>(
    conversationsQueryKey,
    (conversations) =>
      conversations?.map((conversation) =>
        conversation.id === message.conversationId
          ? {
              ...conversation,
              lastMessageAt: message.createdAt,
              lastViewedAt: markViewed
                ? message.createdAt
                : conversation.lastViewedAt,
            }
          : conversation,
      ) ?? conversations,
  )

  queryClient.setQueryData<ConversationWithUserState | null>(
    conversationQueryKey(message.conversationId),
    (conversation) =>
      conversation
        ? {
            ...conversation,
            lastMessageAt: message.createdAt,
            lastViewedAt: markViewed
              ? message.createdAt
              : conversation.lastViewedAt,
          }
        : conversation,
  )
}
