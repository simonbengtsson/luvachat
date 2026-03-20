import { chat, toServerSentEventsResponse } from "@tanstack/ai"
import { createOpenRouterText } from "@tanstack/ai-openrouter"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { getLuvaEnv } from "@/core/luvabase"

type AIChatModelMessage = {
  role: "user" | "assistant"
  content: string
}

const MessagePartSchema = z
  .object({
    type: z.string(),
    content: z.unknown().optional(),
    text: z.unknown().optional(),
  })
  .loose()

const AIChatRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  messages: z.array(
    z
      .object({
        role: z.enum(["system", "user", "assistant", "tool"]),
        content: z.unknown().optional(),
        parts: z.array(MessagePartSchema).optional(),
      })
      .loose(),
  ),
})

function getTextFromContent(content: unknown) {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .filter(
      (part): part is { type?: unknown; content?: unknown; text?: unknown } =>
        typeof part === "object" && part !== null,
    )
    .map((part) => {
      if (part.type !== "text") {
        return ""
      }

      if (typeof part.content === "string") {
        return part.content
      }

      if (typeof part.text === "string") {
        return part.text
      }

      return ""
    })
    .join("")
}

function toModelMessage(
  message: z.infer<typeof AIChatRequestSchema>["messages"][number],
): AIChatModelMessage | null {
  if (message.role === "system" || message.role === "tool") {
    return null
  }

  const content = message.parts
    ? message.parts
        .map((part) => {
          if (part.type !== "text") {
            return ""
          }

          if (typeof part.content === "string") {
            return part.content
          }

          if (typeof part.text === "string") {
            return part.text
          }

          return ""
        })
        .join("")
    : getTextFromContent(message.content)

  if (!content.trim()) {
    return null
  }

  return {
    role: message.role,
    content,
  }
}

export const Route = createFileRoute("/api/aichat")({
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

        const json = await request.json()
        const parsedBody = AIChatRequestSchema.safeParse(json)

        if (!parsedBody.success) {
          return new Response(
            JSON.stringify({ error: "Invalid AI chat request" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        const messages = parsedBody.data.messages
          .map(toModelMessage)
          .filter((message): message is AIChatModelMessage => message !== null)

        if (messages.length === 0) {
          return new Response(
            JSON.stringify({ error: "At least one text message is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        try {
          const stream = chat({
            adapter: createOpenRouterText(
              "openai/gpt-5-nano",
              openRouterService.apiKey,
            ),
            systemPrompts: [
              "You are a helpful AI assistant inside the Luvachat app.",
            ],
            messages,
            conversationId:
              parsedBody.data.conversationId ?? crypto.randomUUID(),
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
