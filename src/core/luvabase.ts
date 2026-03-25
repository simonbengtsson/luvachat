import {
  getAdminUrl as getSdkAdminUrl,
  getLuvaEnv as getSdkLuvaEnv,
  getMembers as getSdkMembers,
  getSessionInfo as getSdkSessionInfo,
  type LuvaEnv,
  type Member,
  type Session,
} from "@luvabase/sdk"

export const DEV_USER_COOKIE_NAME = "luvachat-dev-user"

export function hasLuvaEnv() {
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

function getDevUserIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie")
  if (!cookieHeader) {
    return null
  }

  for (const cookie of cookieHeader.split(/;\s*/)) {
    const [name, ...valueParts] = cookie.split("=")
    if (name !== DEV_USER_COOKIE_NAME) {
      continue
    }

    const value = valueParts.join("=")
    return value ? decodeURIComponent(value) : null
  }

  return null
}

export async function getSession(
  request: Request,
): Promise<Session & { user: Member }> {
  if (hasLuvaEnv()) {
    const session = await getSdkSessionInfo(request)
    if (!session.user) {
      throw new Error("No user, but required")
    }
    return {
      user: session.user,
    }
  }

  const cookieUserId = getDevUserIdFromRequest(request)
  const envUserId = import.meta.env.VITE_DEV_USER

  return {
    user:
      members[cookieUserId as keyof typeof members] ??
      members[envUserId as keyof typeof members] ??
      members.abc,
  }
}

export async function getMembers(request: Request): Promise<Member[]> {
  if (hasLuvaEnv()) {
    return getSdkMembers(request)
  }

  return Object.values(members)
}

export function getLuvaEnv(): LuvaEnv {
  if (hasLuvaEnv()) {
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
  console.log("getAdminUrl", hasLuvaEnv())
  if (hasLuvaEnv()) {
    return getSdkAdminUrl()
  }
  return `https://luvabase.com/dash/pods/${getLuvaEnv().podId}`
}

export type { LuvaEnv, Member, Session }
