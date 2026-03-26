import { eq } from "drizzle-orm"
import { conversationMembersTable, conversationsTable } from "../schema"
import type { ServerEvent } from "../sync-events"
import type { OrpcContext } from "./context"

function sendEvent(webSockets: WebSocket[], payload: string): void {
  for (const ws of webSockets) {
    ws.send(payload)
  }
}

export function broadcastEvent(
  context: OrpcContext,
  event: ServerEvent,
): void {
  const payload = JSON.stringify(event)

  sendEvent(context.getWebSockets(), payload)
}

export function broadcastEventToUsers(
  context: OrpcContext,
  event: ServerEvent,
  userIds: string[],
): void {
  const payload = JSON.stringify(event)

  for (const userId of new Set(userIds)) {
    sendEvent(context.getWebSockets(userId), payload)
  }
}

export function broadcastWorkspaceUpdated(
  context: OrpcContext,
  userIds?: string[],
): void {
  const event = {
    type: "workspaceUpdated",
  } as const

  if (!userIds || userIds.length === 0) {
    broadcastEvent(context, event)
    return
  }

  broadcastEventToUsers(context, event, userIds)
}

export async function broadcastConversationEvent(
  context: OrpcContext,
  conversationId: string,
  event: ServerEvent,
): Promise<void> {
  const conversation = await context.db
    .select({
      type: conversationsTable.type,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1)

  if (!conversation[0]) {
    return
  }

  if (conversation[0].type === "channel") {
    broadcastEvent(context, event)
    return
  }

  const members = await context.db
    .select({
      userId: conversationMembersTable.userId,
    })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId))

  broadcastEventToUsers(
    context,
    event,
    members.map((member) => member.userId),
  )
}
