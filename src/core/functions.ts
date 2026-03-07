import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { getDatabase } from "./database"
import { generateShortId } from "./generateId"
import { channelsTable } from "./schema"

export const getChannels = createServerFn({}).handler(async () => {
  return await getDatabase().select().from(channelsTable)
})

export const addChannel = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const CHANNEL_NAME_REGEX = /^[a-z0-9]+$/

    const name = data.name.trim()
    if (!CHANNEL_NAME_REGEX.test(name)) {
      throw new Error("Channel name must only contain lowercase a-z and 0-9")
    }

    const channel = {
      id: generateShortId(),
      name,
      createdAt: new Date().toISOString(),
    }
    await getDatabase().insert(channelsTable).values(channel)
    return channel
  })

export const getChannelByName = createServerFn({})
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const name = data.name.trim()
    const channels = await getDatabase()
      .select()
      .from(channelsTable)
      .where(eq(channelsTable.name, name))
      .limit(1)
    return channels[0] ?? null
  })
