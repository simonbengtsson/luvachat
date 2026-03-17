import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import type { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { z } from "zod"

const base = os.$context<{ db: ReturnType<typeof drizzle>; userId: string }>()

const syncObjectRpcRouter = {
  hello: base
    .output(
      z.object({
        message: z.string(),
      }),
    )
    .handler(({ context }) => {
      return {
        message: "hello world",
      }
    }),
}

export const orpcHandler = new RPCHandler(syncObjectRpcRouter)
