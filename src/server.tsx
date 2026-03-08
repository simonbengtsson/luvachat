import handler from "@tanstack/react-start/server-entry"

export { SyncObject } from "./core/SyncObject"

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === "/sync") {
      const syncObject = env.SyncObject.getByName("workspace")
      const headers = new Headers(request.headers)

      if (!headers.get("x-luvabase-user-id")) {
        const userId = url.searchParams.get("userId")?.trim()
        if (userId) {
          headers.set("x-luvabase-user-id", userId)
        }
      }

      return syncObject.fetch(new Request(request, { headers }))
    }

    return handler.fetch(request)
  },
}
