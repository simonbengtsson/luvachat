import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import type { orpcRouter } from "./orpcFunctions"

const syncObjectRpcLink = new RPCLink({
  url: "http://localhost:3000/sync/orpc",
})

type SyncObjectRpcClient = RouterClient<typeof orpcRouter>

export const orpcClient =
  createORPCClient<SyncObjectRpcClient>(syncObjectRpcLink)
