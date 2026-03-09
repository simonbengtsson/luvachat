import { queryOptions } from "@tanstack/react-query"
import { getConversations } from "./functions"

export const conversationsQueryKey = ["conversations"] as const

export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: conversationsQueryKey,
    queryFn: () => getConversations(),
  })
}
