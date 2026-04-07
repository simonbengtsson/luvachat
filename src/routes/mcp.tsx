import { getSession } from "@/core/luvabase"
import { createServerOrpcClient } from "@/core/orpcClient"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"
import { z } from "zod"

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const url = new URL(request.url)
        console.log("MCP request", url.pathname)

        const getOrpcClient = async () => {
          const session = await getSession(request)
          const syncObject = env.SyncObject.getByName("workspace")
          return createServerOrpcClient(syncObject, session.id)
        }

        const server = new McpServer({ name: "luvachat", version: "1.0.0" })

        server.registerTool(
          "listConversations",
          { title: 'List Conversations', description: "List all conversations the current user is a member of, including public channels" },
          async () => {
            console.log("Listing conversations")
            const orpcClient = await getOrpcClient()
            const conversations = await orpcClient.getConversations()
            return {
              content: [
                { type: "text", text: JSON.stringify(conversations, null, 2) },
              ],
            }
          },
        )

        server.registerTool(
          'sendMessage',
          { title: 'Send Message', description: "Send a message to a conversation", inputSchema: z.object({
            conversationId: z.string(),
            message: z.string(),
          }) },
          async ({ conversationId, message }) => {
            console.log("Sending message")
            const orpcClient = await getOrpcClient()
            await orpcClient.sendMessage({
              conversationId,
              content: message,
              attachments: [],
            })
            return {
              content: [
                { type: "text", text: "Message sent" },
              ],
            }
          },
        );

        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode for Cloudflare Workers
          enableJsonResponse: true,
        })

        await server.connect(transport)
        const response = await transport.handleRequest(request)
        await server.close()
        return response
      },
    },
  },
})
