import {
  type Member,
} from "@/core/luvabase"
import { switchDevUser } from "@/route.functions"
import { useMutation } from "@tanstack/react-query"
import { NativeSelect, NativeSelectOption } from "./ui/native-select"

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
