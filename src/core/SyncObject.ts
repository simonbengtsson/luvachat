import { migrations } from "@/server/migrations"
import { DurableObject } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"

export class SyncObject extends DurableObject {
  private db: ReturnType<typeof drizzle>

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env)

    this.db = drizzle(state.storage)

    state.blockConcurrencyWhile(async () => {
      await migrate(this.db, { migrations })
    })
  }
}
