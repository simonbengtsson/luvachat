import {
  DEV_USER_COOKIE_NAME,
  getDeploymentMode,
  getMembers as getLuvaMembers,
  getSession as getLuvaSession,
  isDevEnv,
} from "@/core/luvabase"
import type { CloudflareAccessEnv } from "@/core/cloudflareAccess"
import type { RuntimeEnv } from "luvabase/runtime"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setCookie } from "@tanstack/react-start/server"
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
    const session = await getLuvaSession(request, getRuntimeEnv())

    return {
      session,
      luvabaseAdminUrl: request.headers.get("x-luvabase-pod-url") || null,
      canSwitchDevUser: isDevEnv(),
    }
  },
)

export const getDeploymentInfo = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    return {
      mode: getDeploymentMode(request, getRuntimeEnv()),
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
  .inputValidator(
    z.object({
      userId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDevEnv()) {
      return
    }

    const request = getRequest()
    const members = await getLuvaMembers(request, getRuntimeEnv())
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

function getRuntimeEnv(): CloudflareAccessEnv & RuntimeEnv {
  return {
    CF_ACCESS_AUD: process.env["CF_ACCESS_AUD"],
    CF_ACCESS_TEAM_DOMAIN: process.env["CF_ACCESS_TEAM_DOMAIN"],
    MEMBERS_JSON: process.env["MEMBERS_JSON"],
    LUVABASE_RUNTIME_VERSION: process.env["LUVABASE_RUNTIME_VERSION"],
    LUVABASE_POD_ID: process.env["LUVABASE_POD_ID"],
    LUVABASE_POD_URL: process.env["LUVABASE_POD_URL"],
    LUVABASE_POD_INSTALLED_AT: process.env["LUVABASE_POD_INSTALLED_AT"],
    LUVABASE_POD_UPDATED_AT: process.env["LUVABASE_POD_UPDATED_AT"],
    LUVABASE_POD_SECRET: process.env["LUVABASE_POD_SECRET"],
  } as CloudflareAccessEnv & RuntimeEnv
}
