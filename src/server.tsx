import { getSessionInfo } from "@luvabase/sdk"
import handler from "@tanstack/react-start/server-entry"
import { setLuvabaseDevEnvironment } from "./core/luvabase"

export { SyncObject } from "./core/SyncObject"

setLuvabaseDevEnvironment()

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/sync")) {
      const session = await getSessionInfo(request)
      const syncObject = env.SyncObject.getByName("workspace")
      const headers = new Headers(request.headers)
      headers.set("x-user-id", session.user!.id)
      return syncObject.fetch(new Request(request, { headers }))
    }

    return handler.fetch(request)
  },
}
