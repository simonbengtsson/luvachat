import { queryOptions, useQuery } from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"

export const activityQueryKey = ["activity"] as const

export function activityQueryOptions() {
  return queryOptions({
    queryKey: activityQueryKey,
    queryFn: () => orpcClient.getActivity(),
  })
}

export function useActivity() {
  return useQuery(activityQueryOptions())
}
