import {
  infiniteQueryOptions,
  queryOptions,
  useQuery,
} from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"

export const threadsQueryKey = ["threads"] as const
const threadsPageSize = 20

export function threadsQueryOptions({
  unreadOnly = false,
  limit = threadsPageSize,
}: {
  unreadOnly?: boolean
  limit?: number
} = {}) {
  return queryOptions({
    queryKey: [...threadsQueryKey, "page", { unreadOnly, limit }] as const,
    queryFn: () => orpcClient.getThreads({ unreadOnly, limit }),
  })
}

export function useHasUnreadThreads() {
  return useQuery(
    queryOptions({
      ...threadsQueryOptions({
        unreadOnly: true,
        limit: 1,
      }),
      select: (data) => data.threads.length > 0,
    }),
  )
}

export function threadsInfiniteQueryOptions(unreadOnly = false) {
  return infiniteQueryOptions({
    queryKey: [...threadsQueryKey, "infinite", unreadOnly ? "unread" : "all"],
    queryFn: ({ pageParam }) =>
      orpcClient.getThreads({
        unreadOnly,
        cursor: pageParam,
        limit: threadsPageSize,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      threads: data.pages.flatMap((page) => page.threads),
    }),
  })
}
