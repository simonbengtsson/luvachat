import { atom, getDefaultStore } from "jotai"
import type { Conversation } from "./schema"
import type { ServerEvent } from "./sync-events"

export const conversationsAtom = atom<Conversation[]>([])
const store = getDefaultStore()

export function handleMessage(event: ServerEvent) {
  console.log("[sync] store received event", event)

  if (event.type === "initialData") {
    store.set(conversationsAtom, event.conversations)
  }
}
