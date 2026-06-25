import { type Member } from "@/core/luvabase"
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
    <span className="inline-flex max-w-full items-center gap-2 align-middle">
      <span className="shrink-0 font-medium text-white/90">Current User</span>
      <NativeSelect
        size="sm"
        className="w-36 max-w-full text-white [&_[data-slot=native-select-icon]]:text-white/80 [&_[data-slot=native-select]]:border-white/40 [&_[data-slot=native-select]]:bg-white/10 [&_[data-slot=native-select]]:text-white [&_[data-slot=native-select]]:focus-visible:border-white/70 [&_[data-slot=native-select]]:focus-visible:ring-white/30"
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
          <NativeSelectOption
            key={member.id}
            value={member.id}
            className="text-foreground"
          >
            {member.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </span>
  )
}
