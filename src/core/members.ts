import { getWorkspaceMembers } from "@/route.functions"
import { useQuery } from "@tanstack/react-query"
import type { Member } from "./luvabase"

export const workspaceMembersQueryKey = ["workspace-members"] as const

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: workspaceMembersQueryKey,
    queryFn: (): Promise<Member[]> => getWorkspaceMembers(),
    staleTime: 1000 * 60 * 5,
  })
}
