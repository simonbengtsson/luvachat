import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import type { orpcRouter } from "./orpcFunctions"

type SyncObjectRpcClient = RouterClient<typeof orpcRouter>

export let orpcClient: ReturnType<typeof createORPCClient<SyncObjectRpcClient>>

export function initClient(baseUrl: string) {
  const url = new URL("/sync/orpc", baseUrl)
  const link = new RPCLink({
    url: url.toString(),
  })

  orpcClient = createORPCClient<SyncObjectRpcClient>(link)
}
