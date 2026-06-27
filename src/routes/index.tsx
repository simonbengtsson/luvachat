import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import {
  conversationsQueryKey,
  useConversations,
} from "@/core/conversationsQuery"
import { orpcClient } from "@/core/orpcClient"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { MessageSquareTextIcon } from "lucide-react"
import { useEffect, useRef } from "react"

export const Route = createFileRoute("/")({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const conversationsQuery = useConversations()
  const hasCreatedInitialConversationRef = useRef(false)
  const {
    error: createConversationError,
    isPending: isCreatingConversation,
    mutate: createConversation,
  } = useMutation({
    mutationFn: () => orpcClient.createConversation({ name: "general" }),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
      void navigate({
        to: "/c/$conversationId",
        params: { conversationId: conversation.id },
        replace: true,
      })
    },
  })

  useEffect(() => {
    const firstConversation = conversationsQuery.data?.at(0)
    if (firstConversation) {
      void navigate({
        to: "/c/$conversationId",
        params: { conversationId: firstConversation.id },
        replace: true,
      })
      return
    }

    if (
      conversationsQuery.data &&
      !isCreatingConversation &&
      !hasCreatedInitialConversationRef.current
    ) {
      hasCreatedInitialConversationRef.current = true
      createConversation()
    }
  }, [
    conversationsQuery.data,
    createConversation,
    isCreatingConversation,
    navigate,
  ])

  if (conversationsQuery.error) {
    throw conversationsQuery.error
  }

  if (createConversationError) {
    throw createConversationError
  }

  return (
    <GlobalStatusPage
      title="Luvachat"
      message="Opening your workspace..."
      icon={<MessageSquareTextIcon />}
    />
  )
}
