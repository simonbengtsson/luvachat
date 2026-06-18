import {
  DEV_USER_COOKIE_NAME,
  getDeploymentMode,
  getMembers as getLuvaMembers,
  getSession as getLuvaSession,
  isDevEnv,
} from "@/core/luvabase"
import type { CloudflareAccessEnv } from "@/core/cloudflareAccess"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { z } from "zod"

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    return getLuvaSession(request, getCloudflareAccessEnv())
  },
)

export const getSidebarSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    const session = await getLuvaSession(request, getCloudflareAccessEnv())

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
      mode: getDeploymentMode(request, getCloudflareAccessEnv()),
    }
  },
)

export const getWorkspaceMembers = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    return getLuvaMembers(request, getCloudflareAccessEnv())
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
    const members = await getLuvaMembers(request, getCloudflareAccessEnv())
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

function getCloudflareAccessEnv(): CloudflareAccessEnv {
  return {
    CF_ACCESS_AUD: process.env["CF_ACCESS_AUD"],
    CF_ACCESS_TEAM_DOMAIN: process.env["CF_ACCESS_TEAM_DOMAIN"],
    MEMBERS_JSON: process.env["MEMBERS_JSON"],
  } as CloudflareAccessEnv
}
