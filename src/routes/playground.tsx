import { createDatabase } from '@/core/db'
import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'

export const Route = createFileRoute('/playground')({
  server: {
    handlers: {
      GET: async () => {
        const db = createDatabase()
        const result = await db.get(sql.raw(`SELECT 1`))
        return new Response(JSON.stringify(result))
      },
    },
  },
})
