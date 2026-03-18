import { overrideEnvironment } from "@luvabase/sdk"

export function setLuvabaseDevEnvironment() {
  if (!import.meta.env.DEV) {
    return
  }

  const user = {
    id: "123",
    name: "John Doe",
    imageUrl: "https://i.pravatar.cc/150?u=123",
  }
  overrideEnvironment({
    luvaEnv: {
      podId: "123",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      services: {
        OPENROUTER: {
          type: "openrouter",
          name: "OPENROUTER",
          createdAt: new Date().toISOString(),
          apiKey:
            "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",
          apiKeyLabel: "sk-or-v1-d1c...7ce",
        },
      },
    },
    session: {
      user,
    },
    members: [user],
  })
}
