import {
  getMembers as getRuntimeMembers,
  getSession as getRuntimeSession,
  type LuvaEnv,
  type Member,
  type RuntimeEnv,
} from "luvabase/runtime";
import {
  type CloudflareAccessEnv,
  getCloudflareAccessMembers,
  getCloudflareAccessSession,
  hasCloudflareAccessConfig,
} from "./cloudflareAccess";

export const DEV_USER_COOKIE_NAME = "luvachat-dev-user"

type Session = { id: string; name: string; imageUrl: string | null }
export type DeploymentMode = "luvabase" | "cloudflare" | "demo"

export function isDevEnv() {
  return Boolean(import.meta.env.DEV)
}

export function getDeploymentMode(
  request: Request,
  env?: CloudflareAccessEnv & RuntimeEnv,
): DeploymentMode {
  if (isLuvabaseRequest(request, env)) {
    return "luvabase"
  }

  if (hasCloudflareAccessConfig(request, env)) {
    return "cloudflare"
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
  if (deploymentMode === "cloudflare") {
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
  env?: CloudflareAccessEnv & RuntimeEnv,
): Promise<Member[]> {
  const deploymentMode = getDeploymentMode(request, env)
  const workspaceMembers =
    deploymentMode === "luvabase"
      ? await getRuntimeMembers(env!)
      : deploymentMode === "cloudflare"
        ? getCloudflareAccessMembers(env!)
        : Object.values(members)

  return workspaceMembers.filter((member): member is Member =>
    Boolean(member?.id),
  )
}

function isLuvabaseRequest(
  request: Request,
  env?: RuntimeEnv,
): boolean {
  return Boolean(
    getRuntimeSession(request).isAuthenticated || env?.LUVABASE_POD_SECRET,
  )
}

function getLuvabaseSession(request: Request): Session {
  const session = getRuntimeSession(request)
  const member = session.member

  if (!member) {
    throw new Error("Missing Luvabase user headers")
  }

  return {
    id: member.id,
    name: member.name,
    imageUrl: member.imageUrl,
  }
}

export type { LuvaEnv, Member };
