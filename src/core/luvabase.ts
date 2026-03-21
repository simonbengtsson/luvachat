import {
  getAdminUrl as getSdkAdminUrl,
  getLuvaEnv as getSdkLuvaEnv,
  getMembers as getSdkMembers,
  getSessionInfo as getSdkSessionInfo,
  type LuvaEnv,
  type Member,
  type Session,
} from "@luvabase/sdk"

function shouldUseLuvabase() {
  return Boolean(process.env.luvaEnv)
}

const members = {
  abc: {
    id: "abc",
    name: "John Doe",
    imageUrl: "https://i.pravatar.cc/150?u=123",
  },
  def: {
    id: "def",
    name: "Charlie Smith",
    imageUrl: "https://i.pravatar.cc/150?u=def",
  },
  ghi: {
    id: "ghi",
    name: "David Johnson",
    imageUrl: "https://i.pravatar.cc/150?u=ghi",
  },
}

export async function getSession(
  request: Request,
): Promise<Session & { user: Member }> {
  console.log("getSession", shouldUseLuvabase())
  if (shouldUseLuvabase()) {
    const session = await getSdkSessionInfo(request)
    if (!session.user) {
      throw new Error("No user, but required")
    }
    return {
      user: session.user,
    }
  }

  console.log("VITE_DEV_USER", import.meta.env.VITE_DEV_USER)

  return {
    user:
      members[import.meta.env.VITE_DEV_USER as keyof typeof members] ??
      members.abc,
  }
}

export async function getMembers(request: Request): Promise<Member[]> {
  console.log("getMembers", shouldUseLuvabase())
  if (shouldUseLuvabase()) {
    return getSdkMembers(request)
  }

  return Object.values(members)
}

export function getLuvaEnv(): LuvaEnv {
  console.log("getLuvaEnv", shouldUseLuvabase())
  if (shouldUseLuvabase()) {
    return getSdkLuvaEnv()
  }

  return {
    podId: "123",
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    services: {
      OPENROUTER: {
        type: "openrouter",
        name: "OPENROUTER",
        createdAt: new Date().toISOString(),
        apiKey: process.env.OPENROUTER_API_KEY!,
        apiKeyLabel: "Luvachat test api key 2",
      },
    },
  }
}

export function getAdminUrl(): string {
  console.log("getAdminUrl", shouldUseLuvabase())
  if (shouldUseLuvabase()) {
    return getSdkAdminUrl()
  }
  return `https://luvabase.com/dash/pods/${getLuvaEnv().podId}`
}

export type { LuvaEnv, Member, Session }
