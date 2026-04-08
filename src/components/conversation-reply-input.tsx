import {
  AppChatInput,
  type AppChatInputHandle,
} from "@/components/app-chat-input"
import {
  getSyncConnectionStatus,
  subscribeToSyncConnectionStatus,
} from "@/core/clientConnection"
import type { Member } from "@/core/luvabase"
import type { EnrichedMessage } from "@/core/models"
import { orpcClient } from "@/core/orpcClient"
import {
  applyMessageCreatedToCache,
  markConversationViewedInCache,
} from "@/core/realtimeCache"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { JSONContent } from "@tiptap/react"
import { LoaderCircleIcon } from "lucide-react"
import { useRef, useSyncExternalStore } from "react"

type ConversationReplyInputProps = {
  conversationId: string
  threadMessageId?: string
  members: Member[]
  placeholder: string
  autoFocus?: boolean
  onMessageSent?: (message: EnrichedMessage) => void
}

export function ConversationReplyInput({
  conversationId,
  threadMessageId,
  members,
  placeholder,
  autoFocus = false,
  onMessageSent,
}: ConversationReplyInputProps) {
  const composerRef = useRef<AppChatInputHandle>(null)
  const queryClient = useQueryClient()
  const syncConnectionStatus = useSyncExternalStore(
    subscribeToSyncConnectionStatus,
    getSyncConnectionStatus,
    getSyncConnectionStatus,
  )
  const isSyncConnected = syncConnectionStatus === "connected"

  const sendMessageMutation = useMutation({
    mutationFn: ({
      content,
      tiptapJson,
      attachments,
    }: {
      content: string
      tiptapJson: string | null
      attachments: File[]
    }) =>
      orpcClient.sendMessage({
        conversationId,
        threadRootMessageId: threadMessageId,
        content,
        tiptapJson,
        attachments,
      }),
    onSuccess: (message) => {
      applyMessageCreatedToCache(queryClient, message)
      if (!message.threadRootMessageId) {
        markConversationViewedInCache(
          queryClient,
          conversationId,
          message.createdAt,
        )
      }
      composerRef.current?.clear()
      onMessageSent?.(message)
    },
  })

  const submitMessage = (
    content: string,
    attachments: File[],
    tiptapDocument: JSONContent,
  ) => {
    if (
      !isSyncConnected ||
      sendMessageMutation.isPending ||
      (!content.trim() && attachments.length === 0)
    ) {
      return
    }

    sendMessageMutation.mutate({
      content,
      tiptapJson: content.trim() ? JSON.stringify(tiptapDocument) : null,
      attachments,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <AppChatInput
        ref={composerRef}
        onSubmit={submitMessage}
        members={members}
        disabled={!isSyncConnected || sendMessageMutation.isPending}
        placeholder={placeholder}
        clearOnSubmit={false}
        allowAttachmentsWithoutText
        autoFocus={autoFocus}
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
