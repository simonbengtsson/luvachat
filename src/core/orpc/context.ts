import { os } from "@orpc/server"
import type { drizzle } from "drizzle-orm/durable-sqlite/driver"
import type { VapidDetails } from "../push-server"

export type OrpcContext = {
  db: ReturnType<typeof drizzle>
  env: Cloudflare.Env
  getWebSockets: (tag?: string) => WebSocket[]
  userId: string
  vapidDetails: VapidDetails | null
  waitUntil: (promise: Promise<unknown>) => void
}

export const base = os.$context<OrpcContext>()
