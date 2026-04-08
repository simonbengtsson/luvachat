import type { Member } from "./luvabase"
import { useQuery } from "@tanstack/react-query"
import { getWorkspaceMembers as getWorkspaceMembersServerFn } from "@/route.functions"

export const getWorkspaceMembers = getWorkspaceMembersServerFn

export const workspaceMembersQueryKey = ["workspace-members"] as const

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: workspaceMembersQueryKey,
    queryFn: (): Promise<Member[]> => getWorkspaceMembers(),
    staleTime: 1000 * 60 * 5,
  })
}
