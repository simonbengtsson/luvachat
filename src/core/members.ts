import { getMembers, type Member } from "./luvabase"
import { useQuery } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"

const getMembersFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest()
  return getMembers(request)
})

export const workspaceMembersQueryKey = ["workspace-members"] as const

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: workspaceMembersQueryKey,
    queryFn: (): Promise<Member[]> => getMembersFn(),
    staleTime: 1000 * 60 * 5,
  })
}
