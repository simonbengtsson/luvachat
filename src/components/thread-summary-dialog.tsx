"use client"

import { Button } from "@/components/ui/button"
import { ChatMessageMarkdown } from "@/components/ui/chat-message"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { EnrichedMessage } from "@/core/models"
import type { UIMessage } from "@tanstack/ai-client"
import { fetchServerSentEvents } from "@tanstack/ai-client"
import { useChat } from "@tanstack/ai-react"
import { CopyIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect } from "react"

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("")
}

export function ThreadSummaryDialog({
  conversationId,
  message,
  onOpenChange,
}: {
  conversationId: string
  message: EnrichedMessage
  onOpenChange: (open: boolean) => void
}) {
  const {
    messages,
    sendMessage,
    stop,
    isLoading,
    error,
  } = useChat({
    id: `thread-summary-${message.id}`,
    onError: (chatError) => {
      console.error("Thread summary error", chatError)
    },
    connection: fetchServerSentEvents("/api/thread-summary", () => {
      return {
        body: {
          conversationId,
          threadRootMessageId: message.id,
        },
      }
    }),
  })

  useEffect(() => {
    void sendMessage("Summarize this thread")
  }, [sendMessage])

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((summaryMessage) => summaryMessage.role === "assistant")
  const summaryText = latestAssistantMessage
    ? getMessageText(latestAssistantMessage)
    : ""
  const showThinking = isLoading && !summaryText

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          stop()
        }

        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-w-[min(100%-2rem,48rem)] gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 py-4 pr-12">
          <DialogTitle>Thread Summary</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
          <div className="min-h-32 space-y-3">
            {summaryText ? (
              <ChatMessageMarkdown content={summaryText} />
            ) : null}
            {showThinking ? (
              <div
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
                aria-live="polite"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                <span>Thinking...</span>
              </div>
            ) : null}
            {error ? (
              <div className="text-sm text-destructive" role="alert">
                Something went wrong. Please try again.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-between border-t bg-muted/50 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            disabled={!summaryText}
            onClick={() => {
              if (summaryText) {
                navigator.clipboard.writeText(summaryText)
              }
            }}
          >
            <CopyIcon className="size-4" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
