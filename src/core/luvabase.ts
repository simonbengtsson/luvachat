import {
  getMembers as getRuntimeMembers,
  type LuvaEnv,
  type Member,
} from "luvabase/runtime";
import {
  type CloudflareAccessEnv,
  getCloudflareAccessMembers,
  getCloudflareAccessSession,
  hasCloudflareAccessConfig,
} from "./cloudflareAccess";

export const DEV_USER_COOKIE_NAME = "luvachat-dev-user"

type Session = { id: string; name: string; imageUrl: string | null }
export type DeploymentMode =
  | "development"
  | "luvabase"
  | "cloudflare-access"
  | "demo"

export function isDevEnv() {
  return Boolean(import.meta.env.DEV)
}

export function getDeploymentMode(
  request: Request,
  env?: CloudflareAccessEnv,
): DeploymentMode {
  if (isDevEnv()) {
    return "development"
  }

  if (isLuvabaseRequest(request)) {
    return "luvabase"
  }

  if (hasCloudflareAccessConfig(request, env)) {
    return "cloudflare-access"
  }

  return "demo"
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
  env?: CloudflareAccessEnv,
): Promise<Session> {
  const deploymentMode = getDeploymentMode(request, env)
  if (deploymentMode === "luvabase") {
    return getLuvabaseSession(request)
  }
  if (deploymentMode === "cloudflare-access") {
    return getCloudflareAccessSession(request, env!)
  }
  return getDemoSession(request)
}

function getDemoSession(request: Request): Session {
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

export async function getMembers(
  request: Request,
  env?: CloudflareAccessEnv,
): Promise<Member[]> {
  const deploymentMode = getDeploymentMode(request, env)
  const workspaceMembers =
    deploymentMode === "luvabase"
      ? await getRuntimeMembers(request)
      : deploymentMode === "cloudflare-access"
        ? getCloudflareAccessMembers(env!)
        : Object.values(members)

  return workspaceMembers.filter((member): member is Member =>
    Boolean(member?.id),
  )
}

function isLuvabaseRequest(request: Request): boolean {
  return Boolean(request.headers.get("x-luvabase-pod-url"))
}

function getLuvabaseSession(request: Request): Session {
  const id =
    request.headers.get("x-luvabase-user-id") ||
    request.headers.get("x-luvabase-actor-id")
  const name =
    request.headers.get("x-luvabase-user-name") ||
    request.headers.get("x-luvabase-actor-name")

  if (!id || !name) {
    throw new Error("Missing Luvabase user headers")
  }

  return {
    id,
    name,
    imageUrl:
      request.headers.get("x-luvabase-user-image-url") ||
      request.headers.get("x-luvabase-actor-image-url") ||
      null,
  }
}

export type { LuvaEnv, Member };
