import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"
import type { EnrichedMessage } from "./models"
import { orpcClient } from "./orpcClient"

export const conversationMessagesQueryKey = (conversationId: string) =>
  ["messages", conversationId] as const

export const messagesQueryKey = (
  conversationId: string,
  threadMessageId?: string | null,
) => ["messages", conversationId, threadMessageId ?? null] as const

export type MessagesPage = {
  messages: EnrichedMessage[]
  nextCursor?: string
}

export function messagesInfiniteQueryOptions(conversationId: string) {
  return infiniteQueryOptions({
    queryKey: messagesQueryKey(conversationId),
    queryFn: ({ pageParam }) =>
      orpcClient.getMessages({
        conversationId,
        cursor: pageParam,
        limit: 10,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      // Flatten all pages and reverse to get oldest → newest (newest at bottom)
      messages: data.pages.flatMap((page) => page.messages).reverse(),
    }),
  })
}

export function threadMessagesQueryOptions(
  conversationId: string,
  threadMessageId: string,
) {
  return queryOptions({
    queryKey: messagesQueryKey(conversationId, threadMessageId),
    queryFn: async () => {
      const data = await orpcClient.getMessages({
        conversationId,
        threadMessageId,
      })

      return [...data.messages].reverse()
    },
  })
}
