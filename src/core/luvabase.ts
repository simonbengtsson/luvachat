import {
  getMembers as getRuntimeMembers,
  type LuvaEnv,
  type Member,
} from "luvabase/runtime"

export const DEV_USER_COOKIE_NAME = "luvachat-dev-user"

export function isDevEnv() {
  return Boolean(import.meta.env.DEV)
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
  if (!isDevEnv()) {
    return {
      id:
        request.headers.get("x-luvabase-user-id") ||
        request.headers.get("x-luvabase-actor-id")!,
      name:
        request.headers.get("x-luvabase-user-name") ||
        request.headers.get("x-luvabase-actor-name")!,
      imageUrl:
        request.headers.get("x-luvabase-user-image-url") ||
        request.headers.get("x-luvabase-actor-image-url") ||
        null,
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
  const workspaceMembers = !isDevEnv()
    ? await getRuntimeMembers(request)
    : Object.values(members)

  return workspaceMembers.filter((member): member is Member =>
    Boolean(member?.id),
  )
}

export type { LuvaEnv, Member }
