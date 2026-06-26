import {
  AppChatInput,
  type AppChatInputHandle,
} from "@/components/app-chat-input"
import {
  getSyncConnectionStatus,
  subscribeToSyncConnectionStatus,
} from "@/core/clientConnection"
import {
  conversationQueryKey,
  conversationsQueryKey,
} from "@/core/conversationsQuery"
import type { Member } from "@/core/luvabase"
import type { EnrichedConversation } from "@/core/models"
import { orpcClient } from "@/core/orpcClient"
import { applyMessageCreatedToCache } from "@/core/realtimeCache"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { JSONContent } from "@tiptap/react"
import { LoaderCircleIcon } from "lucide-react"
import { useRef, useSyncExternalStore } from "react"

type NewMessageInputProps = {
  memberIds: string[]
  members: Member[]
  conversationName?: string
  autoFocus?: boolean
  onMessageSent: (conversationId: string) => void
}

export function NewMessageInput({
  memberIds,
  members,
  conversationName,
  autoFocus = false,
  onMessageSent,
}: NewMessageInputProps) {
  const composerRef = useRef<AppChatInputHandle>(null)
  const queryClient = useQueryClient()
  const syncConnectionStatus = useSyncExternalStore(
    subscribeToSyncConnectionStatus,
    getSyncConnectionStatus,
    getSyncConnectionStatus,
  )
  const isSyncConnected = syncConnectionStatus === "connected"

  const sendDirectMessageMutation = useMutation({
    mutationFn: ({
      memberIds,
      content,
      tiptapJson,
      attachments,
      conversationName,
    }: {
      memberIds: string[]
      content: string
      tiptapJson: string | null
      attachments: File[]
      conversationName?: string
    }) =>
      orpcClient.sendDirectMessage({
        memberIds,
        content,
        tiptapJson,
        attachments,
        conversationName,
      }),
    onSuccess: async ({ conversation, message }, { memberIds }) => {
      const conversationWithUserState: EnrichedConversation = {
        ...conversation,
        memberIds,
        lastViewedAt: message.createdAt,
        lastMessageAt: message.createdAt,
        notificationLevel: "all",
      }

      queryClient.setQueryData<EnrichedConversation[]>(
        conversationsQueryKey,
        (conversations = []) => [
          conversationWithUserState,
          ...conversations.filter((item) => item.id !== conversation.id),
        ],
      )
      queryClient.setQueryData(
        conversationQueryKey(conversation.id),
        conversationWithUserState,
      )
      applyMessageCreatedToCache(queryClient, message)
      onMessageSent(conversation.id)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
    },
  })

  function submitMessage(
    content: string,
    attachments: File[],
    tiptapDocument: JSONContent,
  ) {
    if (
      !isSyncConnected ||
      sendDirectMessageMutation.isPending ||
      memberIds.length === 0 ||
      (!content.trim() && attachments.length === 0)
    ) {
      return
    }

    sendDirectMessageMutation.mutate({
      memberIds,
      content,
      tiptapJson: content.trim() ? JSON.stringify(tiptapDocument) : null,
      attachments,
      conversationName,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <AppChatInput
        ref={composerRef}
        autoFocus={autoFocus}
        onSubmit={submitMessage}
        members={members}
        disabled={!isSyncConnected || sendDirectMessageMutation.isPending}
        placeholder="Jot something down"
        clearOnSubmit={false}
        allowAttachmentsWithoutText
      />
      {!isSyncConnected ? (
        <div
          className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <LoaderCircleIcon className="size-3.5 animate-spin" />
          <span>Not connected, retrying...</span>
        </div>
      ) : null}
    </div>
  )
}
