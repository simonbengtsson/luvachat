import {
  getAdminUrl as getSdkAdminUrl,
  getLuvaEnv as getSdkLuvaEnv,
  getMembers as getSdkMembers,
  type LuvaEnv,
  type Member,
} from "@luvabase/sdk"

export const DEV_USER_COOKIE_NAME = "luvachat-dev-user"

export function hasLuvaEnv() {
  return Boolean(process.env.luvaEnv)
}

const members = {
  abc: {
    id: "abc",
    name: "John Doe",
    type: "user" as const,
    role: "admin" as const,
    imageUrl: "https://i.pravatar.cc/150?u=123",
  },
  def: {
    id: "def",
    name: "Charlie Smith",
    type: "user" as const,
    role: "admin" as const,
    imageUrl: "https://i.pravatar.cc/150?u=def",
  },
  ghi: {
    id: "ghi",
    name: "David Johnson",
    type: "user" as const,
    role: "admin" as const,
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
): Promise<{ id: string; name: string; imageUrl: string | null }> {
  if (hasLuvaEnv()) {
    return {
      id: request.headers.get("x-luvabase-user-id")!,
      name: request.headers.get("x-luvabase-user-name")!,
      imageUrl: request.headers.get("x-luvabase-user-image-url") || null,
    }
  }

  const cookieUserId = getDevUserIdFromRequest(request)
  const envUserId = import.meta.env.VITE_DEV_USER

  const member =
    members[cookieUserId as keyof typeof members] ??
    members[envUserId as keyof typeof members] ??
    members.abc
  return {
    id: member.id,
    name: member.name,
    imageUrl: member.imageUrl,
  }
}

export async function getMembers(request: Request): Promise<Member[]> {
  const workspaceMembers = hasLuvaEnv()
    ? await getSdkMembers(request)
    : Object.values(members)

  return workspaceMembers.filter(
    (member): member is Member => Boolean(member?.id),
  )
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

export type { LuvaEnv, Member }
