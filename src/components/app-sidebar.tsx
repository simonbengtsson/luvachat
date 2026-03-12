import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { createConversation } from "@/core/clientConnection"
import { conversationsQueryOptions } from "@/core/conversationsQuery"
import { getAdminUrl, getMembers, getSessionInfo } from "@luvabase/sdk"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import {
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FilesIcon,
  HashIcon,
  LogOutIcon,
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"
import * as React from "react"
import { AppCommand } from "./app-command"
import { PopupInput } from "./PopupInput"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Skeleton } from "./ui/skeleton"

const CHANNEL_NAME_PLACEHOLDER = "Channel name"

function sanitizeChannelName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function getFallbackText(value?: string | null) {
  const source = value?.trim()
  if (!source) {
    return "NA"
  }

  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
  }

  return source.slice(0, 2).toUpperCase()
}

const getPodInfo = createServerFn({ method: "GET" }).handler(async () => {
  const [members, session] = await Promise.all([getMembers(), getSessionInfo()])
  return {
    members,
    session,
    adminUrl: getAdminUrl(),
  }
})

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const [isSearchDialogOpen, setIsSearchDialogOpen] = React.useState(false)
  const conversationsQuery = useQuery(conversationsQueryOptions())

  const membersQuery = useQuery({
    queryKey: ["sidebar-members-session"],
    queryFn: async () => {
      const podInfo = await getPodInfo()
      return podInfo
    },
  })

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="/" />}
            >
              <MessageCircleIcon className="size-5!" />
              <span className="text-base font-semibold">Luvachat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Channels</SidebarGroupLabel>
          <SidebarMenu>
            {conversationsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <SidebarMenuItem key={`conversation-skeleton-${index}`}>
                  <div className="flex items-center gap-2 px-2 py-2">
                    <Skeleton className="size-4 rounded-sm" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </SidebarMenuItem>
              ))
            ) : conversationsQuery.data?.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No channels yet
                </div>
              </SidebarMenuItem>
            ) : (
              conversationsQuery.data?.map((conversation) => {
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      render={
                        <Link
                          to="/c/$conversationId"
                          params={{ conversationId: conversation.id } as any}
                        />
                      }
                    >
                      <HashIcon />
                      <span>{conversation.name ?? conversation.id}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })
            )}
            <SidebarMenuItem>
              <PopupInput
                placeholder={CHANNEL_NAME_PLACEHOLDER}
                onSubmit={(name) => {
                  const sanitized = sanitizeChannelName(name)
                  if (!sanitized) return
                  createConversation(sanitized)
                }}
                trigger={
                  <SidebarMenuButton className="text-sidebar-foreground/70">
                    <PlusIcon className="text-sidebar-foreground/70" />
                    <span>Add Channel</span>
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarGroupLabel className="mt-4">Members</SidebarGroupLabel>
          <SidebarMenu>
            {membersQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <SidebarMenuItem key={`member-skeleton-${index}`}>
                  <div className="flex items-center gap-2 px-2 py-2">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </SidebarMenuItem>
              ))
            ) : membersQuery.data?.members.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No members yet
                </div>
              </SidebarMenuItem>
            ) : (
              membersQuery.data?.members.map((member) => (
                <SidebarMenuItem key={member.id}>
                  <div className="flex items-center gap-2 px-2 py-2 text-sm">
                    <Avatar className="size-4">
                      <AvatarImage
                        src={member.imageUrl ?? undefined}
                        alt={member.name}
                      />
                      <AvatarFallback className="text-[10px]">
                        {getFallbackText(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{member.name}</span>
                  </div>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/files" />}>
                  <FilesIcon />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setIsSearchDialogOpen(true)
                  }}
                >
                  <SearchIcon />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      href={membersQuery.data?.adminUrl ?? ""}
                      target="_blank"
                    />
                  }
                >
                  <Settings2Icon />
                  <span>Admin</span>
                  <ExternalLinkIcon className="ml-auto opacity-70" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="aria-expanded:bg-muted"
                  />
                }
              >
                {membersQuery.data ? (
                  <>
                    <Avatar className="size-8 rounded-lg grayscale">
                      <AvatarImage
                        src={
                          membersQuery.data.session.user!.imageUrl ?? undefined
                        }
                        alt={membersQuery.data.session.user!.name}
                      />
                      <AvatarFallback className="rounded-lg">
                        {getFallbackText(membersQuery.data.session.user!.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {membersQuery.data.session.user!.name}
                      </span>
                      <span className="truncate text-xs text-foreground/70">
                        {membersQuery.data.session.user!.id}
                      </span>
                    </div>
                  </>
                ) : null}
                <EllipsisVerticalIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem>
                  <LogOutIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <AppCommand
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
      />
    </Sidebar>
  )
}
