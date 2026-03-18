import { overrideEnvironment, type RuntimeService } from "@luvabase/sdk"

export function setLuvabaseDevEnvironment() {
  // Only override the environment in development
  if (!import.meta.env.DEV) {
    return
  }

  const user = {
    id: "123",
    name: "John Doe",
    imageUrl: "https://i.pravatar.cc/150?u=123",
  }
  const services: Record<string, RuntimeService> = {}
  services.OPENROUTER = {
    type: "openrouter",
    name: "OPENROUTER",
    createdAt: new Date().toISOString(),
    apiKey: process.env.OPENROUTER_API_KEY!,
    apiKeyLabel: "Luvachat test api key 2",
  }

  overrideEnvironment({
    luvaEnv: {
      podId: "123",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      services,
    },
    session: {
      user,
    },
    members: [user],
  })
}
