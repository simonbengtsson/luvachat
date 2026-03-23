import { infiniteQueryOptions } from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"

const messageSearchPageSize = 20

export const messageSearchQueryKey = (query: string) =>
  ["message-search", query] as const

export function messageSearchInfiniteQueryOptions(query: string) {
  return infiniteQueryOptions({
    queryKey: [...messageSearchQueryKey(query), "infinite"] as const,
    queryFn: ({ pageParam }) =>
      orpcClient.searchMessages({
        query,
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
