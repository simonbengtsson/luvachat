import { overrideEnvironment, type RuntimeService } from "@luvabase/sdk"

export function setLuvabaseDevEnvironment() {
  if (process.env.luvaEnv) {
    console.log("Using real luvabase env")
    return
  }

  console.log("Using overriden luvabase env")

  const user = {
    id: "abc",
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
    members: [
      user,
      {
        id: "def",
        name: "Charlie Smith",
        imageUrl: "https://i.pravatar.cc/150?u=def",
      },
      {
        id: "ghi",
        name: "David Johnson",
        imageUrl: "https://i.pravatar.cc/150?u=ghi",
      },
    ],
  })
}
