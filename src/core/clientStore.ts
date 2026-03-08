import { atom, getDefaultStore } from "jotai"
import type { Conversation } from "./schema"
import type { ServerEvent } from "./sync-events"

export const conversationsAtom = atom<Conversation[]>([])
const store = getDefaultStore()

export function conversationAtom(conversationId: string) {
  return atom(
    (get) =>
      get(conversationsAtom).find(
        (conversation) => conversation.id === conversationId,
      ) ?? null,
  )
}

export function handleMessage(event: ServerEvent) {
  console.log("[sync] store received event", event)

  if (event.type === "initialData") {
    store.set(conversationsAtom, event.conversations)
    return
  }

  if (event.type === "conversationCreated") {
    store.set(conversationsAtom, (previous) => {
      if (
        previous.some(
          (conversation) => conversation.id === event.conversation.id,
        )
      ) {
        return previous
      }
      return [event.conversation, ...previous]
    })
  }
}
