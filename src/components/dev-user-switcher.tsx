import {
  DEV_USER_COOKIE_NAME,
  getMembers as getLuvaMembers,
  type Member,
  shouldUseLuvabase,
} from "@/core/luvabase"
import { useMutation } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  NativeSelect,
  NativeSelectOption,
} from "./ui/native-select"

const switchDevUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    if (shouldUseLuvabase()) {
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

export function DevUserSwitcher({
  currentUserId,
  members,
}: {
  currentUserId: string
  members: Member[]
}) {
  const switchDevUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await switchDevUser({
        data: {
          userId,
        },
      })
      window.location.reload()
    },
    onError: (error) => {
      console.error("Failed to switch dev user:", error)
    },
  })

  return (
    <section className="px-2 pt-3">
      <div className="mb-2 text-xs font-medium text-sidebar-foreground/70">
        Dev User
      </div>
      <NativeSelect
        className="w-full"
        value={currentUserId}
        disabled={switchDevUserMutation.isPending}
        onChange={(event) => {
          const userId = event.target.value
          if (!userId || userId === currentUserId) {
            return
          }

          switchDevUserMutation.mutate(userId)
        }}
      >
        {members.map((member) => (
          <NativeSelectOption key={member.id} value={member.id}>
            {member.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </section>
  )
}
