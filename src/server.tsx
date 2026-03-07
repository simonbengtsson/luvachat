import handler from "@tanstack/react-start/server-entry"

export { SyncObject } from "./core/SyncObject"

export default {
  fetch: handler.fetch,
}
