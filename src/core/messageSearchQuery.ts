import { infiniteQueryOptions } from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"

const messageSearchPageSize = 20

export const messageSearchQueryKey = (query: string, conversationId?: string) =>
  ["message-search", query, conversationId ?? null] as const

export function messageSearchInfiniteQueryOptions(
  query: string,
  conversationId?: string,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...messageSearchQueryKey(query, conversationId),
      "infinite",
    ] as const,
    queryFn: ({ pageParam }) =>
      orpcClient.searchMessages({
        query,
        conversationId,
        offset: pageParam,
        limit: messageSearchPageSize,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: query.length > 0,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      results: data.pages.flatMap((page) => page.results),
    }),
  })
}
