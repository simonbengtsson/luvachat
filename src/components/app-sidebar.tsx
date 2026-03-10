import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { createConversation } from "@/core/clientConnection"
import { conversationsQueryOptions } from "@/core/conversationsQuery"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  BellIcon,
  CircleUserRoundIcon,
  CreditCardIcon,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Skeleton } from "./ui/skeleton"

const CHANNEL_NAME_PLACEHOLDER = "Channel name"

function sanitizeChannelName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const [isSearchDialogOpen, setIsSearchDialogOpen] = React.useState(false)
  const conversationsQuery = useQuery(conversationsQueryOptions())

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
                  render={<a href="https://luvabase.com" target="_blank" />}
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
                <Avatar className="size-8 rounded-lg grayscale">
                  <AvatarImage src={undefined} alt="Simon" />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Simon</span>
                  <span className="truncate text-xs text-foreground/70">
                    simonbengt@gmail.com
                  </span>
                </div>
                <EllipsisVerticalIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="size-8">
                        <AvatarImage src={undefined} alt="Simon" />
                        <AvatarFallback className="rounded-lg">
                          CN
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">Simon</span>
                        <span className="truncate text-xs text-muted-foreground">
                          simonbengt@gmail.com
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <CircleUserRoundIcon />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CreditCardIcon />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <BellIcon />
                    Notifications
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
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
