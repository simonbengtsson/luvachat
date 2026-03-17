import { infiniteQueryOptions } from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"
import type { Message } from "./schema"

export const messagesQueryKey = (conversationId: string) =>
  ["messages", conversationId] as const

export type MessagesPage = {
  messages: Message[]
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
