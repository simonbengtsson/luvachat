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
      services: {},
    },
    session: {
      user,
    },
    members: [user],
  })
}
