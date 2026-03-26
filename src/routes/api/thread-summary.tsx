import { getLuvaEnv, getMembers, getSession } from "@/core/luvabase"
import type { EnrichedMessage } from "@/core/models"
import { createServerOrpcClient } from "@/core/orpcClient"
import { chat, toServerSentEventsResponse } from "@tanstack/ai"
import { createOpenRouterText } from "@tanstack/ai-openrouter"
import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { z } from "zod"

const ThreadSummaryRequestSchema = z.object({
  conversationId: z.string().min(1),
  threadRootMessageId: z.string().min(1),
})

function getPromptMessageBody(content: string, attachmentCount: number) {
  const parts: string[] = []

  if (content) {
    parts.push(content)
  }

  if (attachmentCount > 0) {
    parts.push(
      `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`,
    )
  }

  return parts.join("\n") || "[No text]"
}

function buildThreadPrompt(
  messages: EnrichedMessage[],
  threadRootMessageId: string,
  membersById: Map<string, string>,
) {
  const sortedMessages = [...messages].sort((left, right) => {
    if (left.id === threadRootMessageId) {
      return -1
    }

    if (right.id === threadRootMessageId) {
      return 1
    }

    return (
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    )
  })
  const rootMessage = sortedMessages.find(
    (message) => message.id === threadRootMessageId,
  )
  const replyCount = Math.max(sortedMessages.length - 1, 0)

  return [
    "Summarize this chat thread for a teammate who needs the important takeaways fast.",
    "Use Markdown.",
    "Use exactly these headings in this order:",
    "## Summary",
    "## Key decisions",
    "## Open questions",
    "## Next actions",
    "If a section has nothing to report, write `None.`",
    "Only use facts from the thread. Do not invent context.",
    "Attachments are metadata only in this prompt. Do not guess their contents.",
    "",
    "Thread overview",
    `Replies: ${replyCount}`,
    rootMessage
      ? `Root message: ${getPromptMessageBody(
          rootMessage.content,
          rootMessage.attachments.length,
        )}`
      : "Root message: [Missing]",
    "",
    "Transcript",
    ...sortedMessages.map((message, index) => {
      const authorName = membersById.get(message.userId) ?? message.userId
      const messageLabel = index === 0 ? "Root message" : `Reply ${index}`

      return [
        `${messageLabel}`,
        `Author: ${authorName}`,
        `Message: ${getPromptMessageBody(
          message.content,
          message.attachments.length,
        )}`,
      ].join("\n")
    }),
  ].join("\n\n")
}

export const Route = createFileRoute("/api/thread-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const openRouterService = getLuvaEnv().services.OPENROUTER
        if (!openRouterService || openRouterService.type !== "openrouter") {
          return new Response(
            JSON.stringify({ error: "OPENROUTER not configured" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        const session = await getSession(request)
        const json = await request.json()
        const parsedBody = ThreadSummaryRequestSchema.safeParse(json)

        if (!parsedBody.success) {
          return new Response(
            JSON.stringify({ error: "Invalid thread summary request" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        const syncObject = env.SyncObject.getByName("workspace")
        const serverOrpcClient = createServerOrpcClient(
          syncObject,
          session.member.id,
        )
        const conversation = await serverOrpcClient.getConversationById({
          conversationId: parsedBody.data.conversationId,
        })

        if (
          !conversation ||
          !conversation.memberIds.includes(session.member.id)
        ) {
          return new Response(
            JSON.stringify({ error: "Conversation not found" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        const [{ messages }, members] = await Promise.all([
          serverOrpcClient.getMessages({
            conversationId: parsedBody.data.conversationId,
            threadMessageId: parsedBody.data.threadRootMessageId,
          }),
          getMembers(request),
        ])

        const rootMessage = messages.find(
          (message) => message.id === parsedBody.data.threadRootMessageId,
        )

        if (
          !rootMessage ||
          rootMessage.threadRootMessageId ||
          rootMessage.threadReplyCount === 0
        ) {
          return new Response(JSON.stringify({ error: "Thread not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        }

        const membersById = new Map(
          members.map((member) => [member.id, member.name ?? member.id]),
        )

        try {
          const stream = chat({
            adapter: createOpenRouterText(
              "openai/gpt-5-nano",
              openRouterService.apiKey,
            ),
            systemPrompts: [
              "You summarize team chat threads inside the Luvachat app. Be concise, practical, and grounded in the thread.",
            ],
            messages: [
              {
                role: "user",
                content: buildThreadPrompt(
                  messages,
                  parsedBody.data.threadRootMessageId,
                  membersById,
                ),
              },
            ],
            conversationId: crypto.randomUUID(),
          })

          return toServerSentEventsResponse(stream)
        } catch (error) {
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : "An error occurred",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          )
        }
      },
    },
  },
})
