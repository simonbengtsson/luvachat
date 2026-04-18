import {
  DEV_USER_COOKIE_NAME,
  getMembers as getLuvaMembers,
  getSession as getLuvaSession,
  useDevEnv,
} from "@/core/luvabase"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { z } from "zod"

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest()
  return getLuvaSession(request)
})

export const getSidebarSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    const session = await getLuvaSession(request)

    return {
      session,
      adminUrl: `https://luvabase.com/dash/pods/123`,
      canSwitchDevUser: useDevEnv(),
    }
  },
)

export const getWorkspaceMembers = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest()
    return getLuvaMembers(request)
  },
)

export const switchDevUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    if (!useDevEnv()) {
      return
    }

    const request = getRequest()
    const members = await getLuvaMembers(request)
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
