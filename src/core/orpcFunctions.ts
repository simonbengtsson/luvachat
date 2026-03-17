import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { z } from "zod"

const syncObjectRpcRouter = {
  hello: os
    .output(
      z.object({
        message: z.string(),
      }),
    )
    .handler(() => {
      return {
        message: "hello world",
      }
    }),
}

export const orpcHandler = new RPCHandler(syncObjectRpcRouter)
