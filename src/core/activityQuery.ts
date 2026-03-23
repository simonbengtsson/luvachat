import {
  infiniteQueryOptions,
  queryOptions,
  useQuery,
} from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"

export const activityQueryKey = ["activity"] as const
const activityPageSize = 20

export function activityQueryOptions({
  unreadOnly = false,
  limit = activityPageSize,
}: {
  unreadOnly?: boolean
  limit?: number
} = {}) {
  return queryOptions({
    queryKey: [...activityQueryKey, "page", { unreadOnly, limit }] as const,
    queryFn: () => orpcClient.getActivity({ unreadOnly, limit }),
  })
}

export function useActivity() {
  return useQuery(
    activityQueryOptions({
      unreadOnly: true,
      limit: 1,
    }),
  )
}

export function activityInfiniteQueryOptions(unreadOnly = false) {
  return infiniteQueryOptions({
    queryKey: [...activityQueryKey, "infinite", unreadOnly ? "unread" : "all"],
    queryFn: ({ pageParam }) =>
      orpcClient.getActivity({
        unreadOnly,
        cursor: pageParam,
        limit: activityPageSize,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      activity: data.pages.flatMap((page) => page.activity),
    }),
  })
}
