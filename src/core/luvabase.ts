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

export async function getSession(
  request: Request,
): Promise<Session & { user: Member }> {
  if (shouldUseLuvabase()) {
    const session = await getSdkSessionInfo(request)
    if (!session.user) {
      throw new Error("No user, but required")
    }
    return {
      user: session.user,
    }
  }

  return {
    user: {
      id: "abc",
      name: "John Doe",
      imageUrl: "https://i.pravatar.cc/150?u=123",
    },
  }
}

export async function getMembers(request: Request): Promise<Member[]> {
  if (shouldUseLuvabase()) {
    return getSdkMembers(request)
  }

  const session = await getSession(request)
  return [
    session.user,
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
  ]
}

export function getLuvaEnv(): LuvaEnv {
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
  if (shouldUseLuvabase()) {
    return getSdkAdminUrl()
  }
  return `https://luvabase.com/dash/pods/${getLuvaEnv().podId}`
}

export type { LuvaEnv, Member, Session }
