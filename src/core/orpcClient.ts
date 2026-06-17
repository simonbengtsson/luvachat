import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import type { orpcRouter } from "./orpcFunctions"

type SyncObjectRpcClient = RouterClient<typeof orpcRouter>

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return process.env.BASE_URL ?? "http://localhost:3000"
}

export let orpcClient = createORPCClient<SyncObjectRpcClient>(
  new RPCLink({
    url: () => new URL("/sync/orpc", getBaseUrl()).toString(),
  }),
)

export function createServerOrpcClient(
  syncObject: DurableObjectStub,
  userId: string,
) {
  return createORPCClient<SyncObjectRpcClient>(
    new RPCLink({
      url: "https://internal/sync/orpc",
      fetch: (request, init) => {
        const headers = new Headers(request.headers)
        headers.set("x-user-id", userId)

        return syncObject.fetch(
          new Request(request, {
            ...init,
            headers,
          }),
        )
      },
    }),
  )
}
