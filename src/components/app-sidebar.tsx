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
import {
  conversationQueryKey,
  conversationsQueryKey,
  conversationsQueryOptions,
  seedConversationQueryCache,
} from "@/core/conversationsQuery"
import { useWorkspaceMembers } from "@/core/members"
import { orpcClient } from "@/core/orpcClient"
import {
  cleanupPushSubscription,
  supportsPushNotifications,
  syncPushSubscription,
} from "@/core/push-client"
import type { ConversationWithUserState } from "@/core/schema"
import { cn } from "@/lib/utils"
import { getAdminUrl, getSessionInfo } from "@luvabase/sdk"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useMatchRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import {
  BellIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  HashIcon,
  LogOutIcon,
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"
import * as React from "react"
import { dispatchOpenAppCommandEvent } from "./app-command.events"
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

function hasUnreadMessages(conversation: ConversationWithUserState) {
  if (!conversation.lastMessageAt) {
    return false
  }

  if (!conversation.lastViewedAt) {
    return true
  }

  return conversation.lastViewedAt < conversation.lastMessageAt
}

const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest()
  const session = await getSessionInfo(request)

  return {
    session,
  }
})

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const membersQuery = useWorkspaceMembers()
  const [notificationPermission, setNotificationPermission] =
    React.useState<NotificationPermission | null>(null)
  const [isEnablingNotifications, setIsEnablingNotifications] =
    React.useState(false)

  React.useEffect(() => {
    if (!supportsPushNotifications()) {
      setNotificationPermission(null)
      return
    }

    const permission = Notification.permission
    setNotificationPermission(permission)

    if (permission === "granted") {
      void syncPushSubscription().catch((error) => {
        console.error("Failed to sync push subscription:", error)
      })
      return
    }

    if (permission === "denied") {
      void cleanupPushSubscription().catch((error) => {
        console.error("Failed to clean up push subscription:", error)
      })
    }
  }, [])

  const handleEnableNotifications = React.useCallback(async () => {
    if (!supportsPushNotifications()) {
      console.warn("Notifications are not supported in this browser.")
      return
    }

    try {
      setIsEnablingNotifications(true)
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      console.info("Notification permission result:", permission)

      if (permission === "granted") {
        await syncPushSubscription()
        return
      }

      if (permission === "denied") {
        await cleanupPushSubscription()
      }
    } catch (error) {
      console.error("Notification permission request failed:", error)
    } finally {
      setIsEnablingNotifications(false)
    }
  }, [])
  const conversationsQuery = useQuery(conversationsQueryOptions())
  const createConversationMutation = useMutation({
    mutationFn: (name: string) => orpcClient.createConversation({ name }),
    onMutate: async (name) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return {
          optimisticConversationId: null as string | null,
          previousConversations: queryClient.getQueryData<
            ConversationWithUserState[]
          >(conversationsQueryKey),
        }
      }

      await queryClient.cancelQueries({ queryKey: conversationsQueryKey })
      const previousConversations = queryClient.getQueryData<
        ConversationWithUserState[]
      >(conversationsQueryKey)
      const optimisticConversation: ConversationWithUserState = {
        id: `optimistic-${Date.now()}`,
        type: "channel",
        name: trimmedName,
        createdAt: new Date().toISOString(),
        lastViewedAt: null,
        lastMessageAt: null,
      }

      queryClient.setQueryData<ConversationWithUserState[]>(
        conversationsQueryKey,
        (conversations = []) => [optimisticConversation, ...conversations],
      )
      queryClient.setQueryData(
        conversationQueryKey(optimisticConversation.id),
        optimisticConversation,
      )

      return {
        optimisticConversationId: optimisticConversation.id,
        previousConversations,
      }
    },
    onError: (_error, _name, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(
          conversationsQueryKey,
          context.previousConversations,
        )
        seedConversationQueryCache(queryClient, context.previousConversations)
        if (context.optimisticConversationId) {
          queryClient.removeQueries({
            queryKey: conversationQueryKey(context.optimisticConversationId),
          })
        }
        return
      }

      if (context?.optimisticConversationId) {
        queryClient.setQueryData<ConversationWithUserState[]>(
          conversationsQueryKey,
          (conversations = []) =>
            conversations.filter(
              (conversation) =>
                conversation.id !== context.optimisticConversationId,
            ),
        )
        queryClient.removeQueries({
          queryKey: conversationQueryKey(context.optimisticConversationId),
        })
      }
    },
    onSuccess: (conversation, _name, context) => {
      queryClient.setQueryData<ConversationWithUserState[]>(
        conversationsQueryKey,
        (conversations = []) => {
          const createdChannel: ConversationWithUserState = {
            ...conversation,
            lastViewedAt: null,
            lastMessageAt: null,
          }
          const withoutOptimistic = context?.optimisticConversationId
            ? conversations.filter(
                (item) => item.id !== context.optimisticConversationId,
              )
            : conversations

          if (withoutOptimistic.some((item) => item.id === createdChannel.id)) {
            return withoutOptimistic
          }

          return [createdChannel, ...withoutOptimistic]
        },
      )
      const createdChannel: ConversationWithUserState = {
        ...conversation,
        lastViewedAt: null,
        lastMessageAt: null,
      }
      queryClient.setQueryData(
        conversationQueryKey(createdChannel.id),
        createdChannel,
      )
      if (context?.optimisticConversationId) {
        queryClient.removeQueries({
          queryKey: conversationQueryKey(context.optimisticConversationId),
        })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
    },
  })

  const sessionQuery = useQuery({
    queryKey: ["sidebar-session"],
    queryFn: () => getSession(),
  })

  React.useEffect(() => {
    if (!conversationsQuery.data) {
      return
    }
    seedConversationQueryCache(queryClient, conversationsQuery.data)
  }, [conversationsQuery.data, queryClient])

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
                const hasUnread = hasUnreadMessages(conversation)
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      isActive={Boolean(
                        matchRoute({
                          to: "/c/$conversationId",
                          params: { conversationId: conversation.id } as any,
                        }),
                      )}
                      render={
                        <Link
                          to="/c/$conversationId"
                          params={{ conversationId: conversation.id } as any}
                        />
                      }
                    >
                      <HashIcon />
                      <span
                        className={cn("truncate", hasUnread && "font-semibold")}
                      >
                        {conversation.name ?? conversation.id}
                      </span>
                      {hasUnread ? (
                        <span
                          aria-hidden
                          className="ml-auto size-2 rounded-full bg-sidebar-foreground"
                        />
                      ) : null}
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
                  createConversationMutation.mutate(sanitized)
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
            ) : membersQuery.data?.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No members yet
                </div>
              </SidebarMenuItem>
            ) : (
              membersQuery.data?.map((member) => (
                <SidebarMenuItem key={member.id}>
                  <div className="flex items-center gap-2 px-2 py-2 text-sm">
                    <Avatar className="size-5">
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
            {notificationPermission === "default" ? (
              <section className="px-2 pb-3">
                <button
                  type="button"
                  disabled={isEnablingNotifications}
                  onClick={() => {
                    void handleEnableNotifications()
                  }}
                  className="flex w-full items-start gap-3 rounded-lg border border-sidebar-border/80 px-3 py-3 text-left transition-colors hover:bg-sidebar-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <BellIcon className="mt-0.5 size-4 shrink-0 text-sidebar-foreground/70" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sidebar-foreground">
                      Enable Notifications
                    </div>
                    <p className="mt-1 text-xs leading-5 text-sidebar-foreground/70">
                      Turn on browser push notifications for new activity.
                    </p>
                  </div>
                </button>
              </section>
            ) : null}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/aichat" />}>
                  <MessageCircleIcon />
                  <span>AI Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={dispatchOpenAppCommandEvent}>
                  <SearchIcon />
                  <span>Search</span>
                  <span className="ml-auto text-xs text-sidebar-foreground/70">
                    ⌘K
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      href={getAdminUrl()}
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
                {sessionQuery.data ? (
                  <>
                    <Avatar className="size-8 rounded-lg">
                      <AvatarImage
                        src={sessionQuery.data.session.user!.imageUrl ?? undefined}
                        alt={sessionQuery.data.session.user!.name}
                      />
                      <AvatarFallback className="rounded-lg">
                        {getFallbackText(sessionQuery.data.session.user!.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {sessionQuery.data.session.user!.name}
                      </span>
                      <span className="truncate text-xs text-foreground/70">
                        {sessionQuery.data.session.user!.id}
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
    </Sidebar>
  )
}
