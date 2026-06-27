import {
  isCloudflareAccessConfigError,
  type CloudflareAccessEnv,
} from "@/core/cloudflareAccess"
import {
  DEV_USER_COOKIE_NAME,
  getDeploymentMode,
  getMembers as getLuvaMembers,
  getSession as getLuvaSession,
} from "@/core/luvabase"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { env as workerEnv } from "cloudflare:workers"
import type { RuntimeEnv } from "luvabase/runtime"
import { z } from "zod"

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    return getLuvaSession(request, getRuntimeEnv())
  },
)

export const getSidebarSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    const runtimeEnv = getRuntimeEnv()
    const deploymentMode = getDeploymentMode(request, runtimeEnv)

    try {
      const session = await getLuvaSession(request, runtimeEnv)

      return {
        session,
        deploymentMode,
        luvabaseAdminUrl:
          runtimeEnv.LUVABASE_POD_ADMIN_URL ||
          null,
        setupError: null,
      }
    } catch (error) {
      if (!isCloudflareAccessConfigError(error)) {
        throw error
      }

      return {
        session: null,
        deploymentMode,
        luvabaseAdminUrl:
          runtimeEnv.LUVABASE_POD_ADMIN_URL ||
          null,
        setupError:
          error instanceof Error
            ? error.message
            : "Cloudflare Access setup is invalid.",
      }
    }
  },
)

export const getWorkspaceMembers = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    return getLuvaMembers(request, getRuntimeEnv())
  },
)

export const switchDevUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      userId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const request = getRequest()
    const runtimeEnv = getRuntimeEnv()

    const members = await getLuvaMembers(request, runtimeEnv)
    const selectedMember = members.find((member) => member.id === data.userId)

    if (!selectedMember) {
      throw new Error("Unknown dev user")
    }

    setCookie(DEV_USER_COOKIE_NAME, selectedMember.id, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
    })
  })

function getRuntimeEnv(): CloudflareAccessEnv & RuntimeEnv & { LUVABASE_POD_ADMIN_URL?: string } {
  const env = workerEnv as CloudflareAccessEnv & RuntimeEnv & { LUVABASE_POD_ADMIN_URL?: string }

  return {
    CF_ACCESS_AUD: env.CF_ACCESS_AUD ?? process.env["CF_ACCESS_AUD"],
    CF_ACCESS_JWKS_URL:
      env.CF_ACCESS_JWKS_URL ?? process.env["CF_ACCESS_JWKS_URL"],
    CF_MEMBERS_JSON: env.CF_MEMBERS_JSON ?? process.env["CF_MEMBERS_JSON"],
    LUVABASE_RUNTIME_VERSION:
      env.LUVABASE_RUNTIME_VERSION ??
      process.env["LUVABASE_RUNTIME_VERSION"],
    LUVABASE_POD_ID: env.LUVABASE_POD_ID ?? process.env["LUVABASE_POD_ID"],
    LUVABASE_POD_URL:
      env.LUVABASE_POD_URL ?? process.env["LUVABASE_POD_URL"],
    LUVABASE_POD_INSTALLED_AT:
      env.LUVABASE_POD_INSTALLED_AT ??
      process.env["LUVABASE_POD_INSTALLED_AT"],
    LUVABASE_POD_UPDATED_AT:
      env.LUVABASE_POD_UPDATED_AT ??
      process.env["LUVABASE_POD_UPDATED_AT"],
    LUVABASE_POD_SECRET:
      env.LUVABASE_POD_SECRET ?? process.env["LUVABASE_POD_SECRET"],
    LUVABASE_POD_ADMIN_URL:
      env.LUVABASE_POD_ADMIN_URL ?? process.env["LUVABASE_POD_ADMIN_URL"],
  } as CloudflareAccessEnv & RuntimeEnv & { LUVABASE_POD_ADMIN_URL?: string }
}
