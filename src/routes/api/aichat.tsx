import { getLunaEnv } from "@luvabase/sdk"
import { chat, toServerSentEventsResponse } from "@tanstack/ai"
import { openRouterText } from "@tanstack/ai-openrouter"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/aichat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const service = getLunaEnv().services.OPENROUTER
        if (service.type !== "openrouter") {
          throw new Error("OPENROUTER not configured")
        }

        const conversationId = "abc"
        const messages = [
          {
            role: "assistant" as const,
            content: "Hello, how can I help you today?",
          },
          {
            role: "user" as const,
            content: "What is the capital of France?",
          },
        ]

        try {
          const stream = chat({
            adapter: openRouterText("openai/gpt-5-nano"),
            systemPrompts: ["You are a helpful assistant."],
            messages,
            conversationId,
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
