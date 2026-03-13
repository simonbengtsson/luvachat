import { infiniteQueryOptions } from "@tanstack/react-query"
import type { Message } from "./schema"
import { getMessages } from "./functions"

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
      getMessages({
        data: {
          conversationId,
          cursor: pageParam,
          limit: 10,
        },
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
