console.log("Server started")

import handler from "@tanstack/react-start/server-entry"
import { getSession } from "./core/luvabase"

export { SyncObject } from "./core/SyncObject"

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    console.log("Request url", url.toString())

    if (url.pathname.startsWith("/sync")) {
      const session = await getSession(request)
      const syncObject = env.SyncObject.getByName("workspace")
      const headers = new Headers(request.headers)
      headers.set("x-user-id", session.user!.id)
      return syncObject.fetch(new Request(request, { headers }))
    }

    return handler.fetch(request)
  },
}
