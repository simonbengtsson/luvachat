import handler from "@tanstack/react-start/server-entry"
import { setLuvabaseDevEnvironment } from "./core/luvabase"

export { SyncObject } from "./core/SyncObject"

setLuvabaseDevEnvironment()

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === "/sync") {
      const syncObject = env.SyncObject.getByName("workspace")
      const headers = new Headers(request.headers)
      return syncObject.fetch(new Request(request, { headers }))
    }

    return handler.fetch(request)
  },
}
