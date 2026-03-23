import { queryOptions } from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"

export const threadsQueryKey = ["threads"] as const

export function threadsQueryOptions() {
  return queryOptions({
    queryKey: threadsQueryKey,
    queryFn: () => orpcClient.getThreads(),
  })
}
