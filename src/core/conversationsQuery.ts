import { queryOptions, type QueryClient } from "@tanstack/react-query"
import type { ConversationWithUserState } from "./schema"
import { getConversation, getConversations } from "./functions"

export const conversationsQueryKey = ["conversations"] as const
export const conversationQueryKey = (conversationId: string) =>
  ["conversation", conversationId] as const

export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: conversationsQueryKey,
    queryFn: () => getConversations(),
  })
}

export function conversationQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: conversationQueryKey(conversationId),
    queryFn: () => getConversation({ data: { conversationId } }),
  })
}

export function seedConversationQueryCache(
  queryClient: QueryClient,
  conversations: ConversationWithUserState[],
) {
  for (const conversation of conversations) {
    queryClient.setQueryData(conversationQueryKey(conversation.id), conversation)
  }
}
