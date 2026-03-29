import handler from "@tanstack/react-start/server-entry"
import {
  createInternalErrorResponse,
  logRequestError,
  withRequestId,
} from "./core/error-reporting"
import { getSession } from "./core/luvabase"

export { SyncObject } from "./core/SyncObject"

export default {
  async fetch(request: Request, env: Env) {
    const requestWithId = withRequestId(request)
    const url = new URL(requestWithId.url)
    let userId: string | undefined

    try {
      if (url.pathname.startsWith("/sync")) {
        const session = await getSession(requestWithId)
        userId = session.id
        const syncObject = env.SyncObject.getByName("workspace")
        const headers = new Headers(requestWithId.headers)
        headers.set("x-user-id", session.id)
        return await syncObject.fetch(new Request(requestWithId, { headers }))
      }

      return await handler.fetch(requestWithId)
    } catch (error) {
      const requestId = requestWithId.headers.get("x-request-id")!

      logRequestError("worker.fetch", requestWithId, error, {
        userId,
      })

      return createInternalErrorResponse(requestId)
    }
  },
}
