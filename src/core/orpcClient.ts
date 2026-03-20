import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import type { orpcRouter } from "./orpcFunctions"

type SyncObjectRpcClient = RouterClient<typeof orpcRouter>

const baseUrl = process.env.BASE_URL || "https://luvachat2.luvabase.workers.dev"

export let orpcClient = createORPCClient<SyncObjectRpcClient>(
  new RPCLink({
    url: new URL("/sync/orpc", baseUrl).toString(),
  }),
)
