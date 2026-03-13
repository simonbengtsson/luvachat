import type {
  InfiniteData,
  QueryClient,
} from "@tanstack/react-query"
import {
  conversationQueryKey,
  conversationsQueryKey,
} from "./conversationsQuery"
import {
  messagesQueryKey,
  type MessagesPage,
} from "./messagesQuery"
import type {
  ConversationWithUserState,
  Message,
} from "./schema"

type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>

export function applyMessageCreatedToCache(
  queryClient: QueryClient,
  message: Message,
  options?: { markViewed?: boolean },
): void {
  upsertMessageInConversationCache(queryClient, message)
  updateConversationMetadata(queryClient, message, options?.markViewed ?? false)
}

function upsertMessageInConversationCache(
  queryClient: QueryClient,
  message: Message,
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

function updateConversationMetadata(
  queryClient: QueryClient,
  message: Message,
  markViewed: boolean,
): void {
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
