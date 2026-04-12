import { createClient } from "@libsql/client/http"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { getLuvaEnv } from "./luvabase"

export type Database = ReturnType<typeof createDatabase>

export function createDatabase() {
  const mainDbService = getLuvaEnv().services.MAINDB
  if (!mainDbService || mainDbService.type !== "turso") {
    throw new Error("MAINDB must be a turso service")
  }

  const client = createClient({
    url: getDatabaseUrl(mainDbService.databaseHostname),
    authToken: mainDbService.databaseApiToken,
    fetch: (request: Request | URL | string, init?: RequestInit) => {
      if (typeof request === "string" || request instanceof URL) {
        return fetch(request, init)
      }

      return fetch(request.url, {
        method: request.method,
        headers: new Headers(request.headers),
        body: request.body,
        redirect: request.redirect,
        signal: request.signal,
      })
    },
  })

  return drizzle({ client })
}

function getDatabaseUrl(databaseHostname: string): string {
  if (
    databaseHostname.startsWith("libsql://") ||
    databaseHostname.startsWith("https://") ||
    databaseHostname.startsWith("http://")
  ) {
    return databaseHostname
  }

  return `libsql://${databaseHostname}`
}

export async function migrateDatabase(
  db: Database,
  config: { migrations: Record<string, string>; migrationsTable?: string },
): Promise<void> {
  const migrationsTable = config.migrationsTable ?? "__drizzle_migrations"

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric,
      name text,
      applied_at TEXT
    )
  `)

  const existingMigrations = await db.all<{ name: string | null }>(
    sql`SELECT name FROM ${sql.identifier(migrationsTable)}`,
  )
  const existingNames = new Set(
    existingMigrations.flatMap((migration) =>
      migration.name ? [migration.name] : [],
    ),
  )

  for (const [name, migration] of Object.entries(config.migrations).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (existingNames.has(name)) {
      continue
    }

    for (const statement of migration
      .split("--> statement-breakpoint")
      .filter((part) => part.trim())) {
      await db.run(sql.raw(statement))
    }

    await db.run(sql`
      INSERT INTO ${sql.identifier(migrationsTable)} (
        "hash",
        "created_at",
        "name",
        "applied_at"
      ) VALUES (${""}, ${parseMigrationFolderMillis(name)}, ${name}, ${new Date().toISOString()})
    `)
  }
}

function parseMigrationFolderMillis(name: string): number {
  return Date.UTC(
    Number(name.slice(0, 4)),
    Number(name.slice(4, 6)) - 1,
    Number(name.slice(6, 8)),
    Number(name.slice(8, 10)),
    Number(name.slice(10, 12)),
    Number(name.slice(12, 14)),
  )
}
