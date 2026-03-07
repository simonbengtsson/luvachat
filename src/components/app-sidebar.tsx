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
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import { addChannel, getChannels } from "@/core/functions"
import type { Channel } from "@/core/schema"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

const CHANNEL_NAME_PLACEHOLDER = "Channel name"

function sanitizeChannelName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const [isSearchDialogOpen, setIsSearchDialogOpen] = React.useState(false)
  const [isAddChannelOpen, setIsAddChannelOpen] = React.useState(false)
  const queryClient = useQueryClient()

  const channelsQuery = useQuery({
    queryKey: ["channels"],
    queryFn: () => getChannels(),
  })

  const addChannelMutation = useMutation({
    mutationFn: (name: string) => addChannel({ data: { name } }),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ["channels"] })
      const prev = queryClient.getQueryData<Channel[]>(["channels"])
      const optimistic: Channel = {
        id: `optimistic-${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<Channel[]>(["channels"], (old) => [
        ...(old ?? []),
        optimistic,
      ])
      return { prev }
    },
    onError: (_err, _name, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["channels"], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] })
    },
  })

  React.useEffect(() => {
    if (!isAddChannelOpen) return
    let frameId: number | undefined
    let cleanup: (() => void) | undefined

    const bindInputHandler = () => {
      const input = document.querySelector<HTMLInputElement>(
        `input[placeholder="${CHANNEL_NAME_PLACEHOLDER}"]`,
      )
      if (!input) {
        frameId = requestAnimationFrame(bindInputHandler)
        return
      }
      const handleInput = () => {
        const raw = input.value
        const sanitized = sanitizeChannelName(raw)
        if (raw === sanitized) return
        const cursor = input.selectionStart ?? raw.length
        const removedCount = raw.length - sanitized.length
        input.value = sanitized
        const nextCursor = Math.max(0, cursor - Math.max(removedCount, 0))
        input.setSelectionRange(nextCursor, nextCursor)
      }

      handleInput()
      input.addEventListener("input", handleInput)
      cleanup = () => {
        input.removeEventListener("input", handleInput)
      }
    }

    bindInputHandler()
    return () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId)
      cleanup?.()
    }
  }, [isAddChannelOpen])

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
            {channelsQuery.isLoading ? (
              <>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              </>
            ) : channelsQuery.data?.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No channels yet
                </div>
              </SidebarMenuItem>
            ) : (
              channelsQuery.data?.map((channel) => {
                const isPending = channel.id.startsWith("optimistic-")
                return (
                  <SidebarMenuItem key={channel.id}>
                    <SidebarMenuButton
                      className={isPending ? "opacity-50" : undefined}
                      render={
                        isPending ? (
                          <span />
                        ) : (
                          <Link
                            to="/c/$channelName"
                            params={{ channelName: channel.name }}
                          />
                        )
                      }
                    >
                      <HashIcon />
                      <span>{channel.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })
            )}
            <SidebarMenuItem>
              <PopupInput
                placeholder={CHANNEL_NAME_PLACEHOLDER}
                open={isAddChannelOpen}
                onOpenChange={setIsAddChannelOpen}
                onSubmit={(name) => {
                  const sanitized = sanitizeChannelName(name)
                  if (!sanitized) return
                  addChannelMutation.mutate(sanitized)
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
