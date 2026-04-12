import { os } from "@orpc/server"
import type { Database } from "../db"
import type { VapidDetails } from "../push-server"

export type OrpcContext = {
  db: Database
  env: Cloudflare.Env
  getWebSockets: (tag?: string) => WebSocket[]
  userId: string
  vapidDetails: VapidDetails | null
  waitUntil: (promise: Promise<unknown>) => void
}

export const base = os.$context<OrpcContext>()
