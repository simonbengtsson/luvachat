import { DurableObject } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/durable-sqlite/driver"
import { migrate } from "drizzle-orm/durable-sqlite/migrator"

import blushingPathSql from "../../drizzle/20260307162158_outstanding_jasper_sitwell/migration.sql?raw"

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

const migrations = {
  "20260307150611_blushing_patch": blushingPathSql,
}
