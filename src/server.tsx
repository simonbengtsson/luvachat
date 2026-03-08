import handler from "@tanstack/react-start/server-entry"

export { SyncObject } from "./core/SyncObject"

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === "/sync") {
      const syncObject = env.SyncObject.getByName("workspace")
      return syncObject.fetch(request)
    }

    return handler.fetch(request)
  },
}
