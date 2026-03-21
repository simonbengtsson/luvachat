import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query"
import { orpcClient } from "./orpcClient"
import type { ConversationWithUserState } from "./schema"

export const conversationsQueryKey = ["conversations"] as const
export const conversationQueryKey = (conversationId: string) =>
  ["conversation", conversationId] as const

export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: conversationsQueryKey,
    queryFn: async () => {
      if (import.meta.env.DEV) {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
      return orpcClient.getConversations()
    },
  })
}

export function useConversations() {
  return useQuery(conversationsQueryOptions())
}

export function conversationQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: conversationQueryKey(conversationId),
    queryFn: () => orpcClient.getConversationById({ conversationId }),
  })
}

export function seedConversationQueryCache(
  queryClient: QueryClient,
  conversations: ConversationWithUserState[],
) {
  for (const conversation of conversations) {
    queryClient.setQueryData(
      conversationQueryKey(conversation.id),
      conversation,
    )
  }
}
