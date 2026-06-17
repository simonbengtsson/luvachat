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
import { useHasUnreadActivity } from "@/core/activityQuery"
import { getConversationDisplayName } from "@/core/conversationDisplay"
import {
  conversationQueryKey,
  conversationsQueryKey,
  seedConversationQueryCache,
  useConversations,
} from "@/core/conversationsQuery"
import { type Member } from "@/core/luvabase"
import { useWorkspaceMembers } from "@/core/members"
import type { EnrichedConversation } from "@/core/models"
import { orpcClient } from "@/core/orpcClient"
import {
  cleanupPushSubscription,
  supportsPushNotifications,
  syncPushSubscription,
} from "@/core/push-client"
import { useHasUnreadThreads } from "@/core/threadsQuery"
import { cn } from "@/lib/utils"
import { getSidebarSession } from "@/route.functions"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Link,
  useMatchRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router"
import {
  ActivityIcon,
  BellIcon,
  BellOffIcon,
  CommandIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  HashIcon,
  LogOutIcon,
  type LucideIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
  UsersIcon,
} from "lucide-react"
import { type ComponentProps, useEffect, useState } from "react"
import { dispatchOpenAppCommandEvent } from "./app-command.events"
import { AppSidebarLoader } from "./app-sidebar-loader"
import { DevUserSwitcher } from "./dev-user-switcher"
import { PopupInput } from "./PopupInput"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

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

function hasUnreadMessages(conversation: EnrichedConversation) {
  if (!conversation.lastMessageAt) {
    return false
  }

  if (!conversation.lastViewedAt) {
    return true
  }

  return conversation.lastViewedAt < conversation.lastMessageAt
}

function isConversationMuted(conversation: EnrichedConversation) {
  return conversation.notificationLevel === "muted"
}

function isConversationMutedIfPresent(conversation?: EnrichedConversation) {
  return conversation?.notificationLevel === "muted"
}

function sortConversationsForSidebar(conversations: EnrichedConversation[]) {
  return [
    ...conversations.filter(
      (conversation) => !isConversationMuted(conversation),
    ),
    ...conversations.filter((conversation) =>
      isConversationMuted(conversation),
    ),
  ]
}

function sortMembersForSidebar(
  members: Member[],
  directConversationsByMemberId: Map<string, EnrichedConversation>,
) {
  return [
    ...members.filter(
      (member) =>
        !isConversationMutedIfPresent(
          directConversationsByMemberId.get(member.id),
        ),
    ),
    ...members.filter((member) =>
      isConversationMutedIfPresent(
        directConversationsByMemberId.get(member.id),
      ),
    ),
  ]
}

function getDirectConversationMemberId(
  conversation: EnrichedConversation,
  currentUserId: string,
) {
  return (
    conversation.memberIds.find((memberId) => memberId !== currentUserId) ??
    null
  )
}

function getGroupConversationName(
  conversation: EnrichedConversation,
  currentUserId: string,
  membersById: Map<string, Member>,
) {
  return getConversationDisplayName(conversation, currentUserId, membersById)
}

function SidebarConversationItem({
  conversation,
  label,
  icon: Icon,
  matchRoute,
}: {
  conversation: EnrichedConversation
  label?: string
  icon: LucideIcon
  matchRoute: ReturnType<typeof useMatchRoute>
}) {
  const isMuted = isConversationMuted(conversation)
  const hasUnread = !isMuted && hasUnreadMessages(conversation)
  const isActive = Boolean(
    matchRoute({
      to: "/c/$conversationId",
      params: { conversationId: conversation.id } as any,
    }),
  )

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        render={
          <Link
            to="/c/$conversationId"
            params={{ conversationId: conversation.id } as any}
          />
        }
      >
        <Icon
          className={cn(isMuted && !isActive && "text-sidebar-foreground/55")}
        />
        <span
          className={cn(
            "truncate",
            hasUnread && "font-semibold",
            isMuted && !isActive && "text-sidebar-foreground/60",
          )}
        >
          {label ?? conversation.name ?? conversation.id}
        </span>
        {isMuted ? (
          <BellOffIcon
            aria-hidden
            className={cn(
              "ml-auto size-3.5",
              isActive
                ? "text-sidebar-foreground/70"
                : "text-sidebar-foreground/40",
            )}
          />
        ) : null}
        {hasUnread ? (
          <span
            aria-hidden
            className="ml-auto size-2 rounded-full bg-sidebar-foreground"
          />
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const search = useSearch({ strict: false })
  const membersQuery = useWorkspaceMembers()
  const conversationsQuery = useConversations()
  const hasUnreadActivityQuery = useHasUnreadActivity()
  const hasUnreadThreadsQuery = useHasUnreadThreads()
  const sessionQuery = useQuery({
    queryKey: ["sidebar-session"],
    queryFn: () => getSidebarSession(),
  })

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | null>(null)
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false)

  useEffect(() => {
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

  async function handleEnableNotifications() {
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
  }

  const createConversationMutation = useMutation({
    mutationFn: (name: string) => orpcClient.createConversation({ name }),
    onMutate: async (name) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return {
          optimisticConversationId: null as string | null,
          previousConversations: queryClient.getQueryData<
            EnrichedConversation[]
          >(conversationsQueryKey),
        }
      }

      await queryClient.cancelQueries({ queryKey: conversationsQueryKey })
      const previousConversations = queryClient.getQueryData<
        EnrichedConversation[]
      >(conversationsQueryKey)
      const optimisticConversation: EnrichedConversation = {
        id: `optimistic-${Date.now()}`,
        type: "channel",
        name: trimmedName,
        createdAt: new Date().toISOString(),
        memberIds: [],
        lastViewedAt: null,
        lastMessageAt: null,
        notificationLevel: "all",
      }

      queryClient.setQueryData<EnrichedConversation[]>(
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
        queryClient.setQueryData<EnrichedConversation[]>(
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
      queryClient.setQueryData<EnrichedConversation[]>(
        conversationsQueryKey,
        (conversations = []) => {
          const createdChannel: EnrichedConversation = {
            ...conversation,
            memberIds: [],
            lastViewedAt: null,
            lastMessageAt: null,
            notificationLevel: "all",
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
      const createdChannel: EnrichedConversation = {
        ...conversation,
        memberIds: [],
        lastViewedAt: null,
        lastMessageAt: null,
        notificationLevel: "all",
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
      void navigate({
        to: "/c/$conversationId",
        params: { conversationId: conversation.id } as any,
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
    },
  })

  useEffect(() => {
    if (!conversationsQuery.data) {
      return
    }
    seedConversationQueryCache(queryClient, conversationsQuery.data)
  }, [conversationsQuery.data, queryClient])

  const isSidebarPending =
    sessionQuery.isPending ||
    conversationsQuery.isPending ||
    membersQuery.isPending

  if (isSidebarPending) {
    return <AppSidebarLoader {...props} />
  }

  const sidebarError =
    sessionQuery.error ??
    conversationsQuery.error ??
    membersQuery.error ??
    hasUnreadThreadsQuery.error ??
    hasUnreadActivityQuery.error

  if (sidebarError) {
    throw sidebarError
  }

  const sessionData = sessionQuery.data
  const conversations = conversationsQuery.data
  const members = membersQuery.data

  if (!sessionData || !conversations || !members) {
    throw new Error("Sidebar data missing")
  }

  const currentUserId = sessionData.session.id
  const canSwitchDevUser = sessionData.canSwitchDevUser
  const hasUnreadThreads = hasUnreadThreadsQuery.data ?? false
  const hasUnreadActivity = hasUnreadActivityQuery.data ?? false
  const membersById = new Map(members.map((member) => [member.id, member]))
  const channelConversations = conversations.filter(
    (conversation) => conversation.type === "channel",
  )
  const groupConversations = conversations.filter(
    (conversation) => conversation.type === "group",
  )
  const directConversations = conversations.filter(
    (conversation) => conversation.type === "direct",
  )
  const directConversationsByMemberId = new Map<string, EnrichedConversation>()

  for (const conversation of directConversations) {
    const memberId = getDirectConversationMemberId(conversation, currentUserId)
    if (!memberId) {
      continue
    }
    directConversationsByMemberId.set(memberId, conversation)
  }

  const sortedChannelConversations =
    sortConversationsForSidebar(channelConversations)
  const sortedGroupConversations =
    sortConversationsForSidebar(groupConversations)
  const sortedMembers = sortMembersForSidebar(
    members,
    directConversationsByMemberId,
  )

  async function handleOpenMemberConversation(
    memberId: string,
    conversationId?: string,
  ) {
    if (conversationId) {
      await navigate({
        to: "/c/$conversationId",
        params: { conversationId } as any,
      })
      return
    }

    await navigate({
      to: "/new",
      search: { members: memberId },
    })
  }

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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={Boolean(
                    matchRoute({ to: "/new" }) &&
                    Object.keys(search).length === 0,
                  )}
                  render={<Link to="/new" search={{ members: "" }} />}
                >
                  <SquarePenIcon />
                  <span>New Message</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={Boolean(matchRoute({ to: "/threads", search: {} }))}
                  render={<Link to="/threads" />}
                >
                  <MessageSquareTextIcon />
                  <span
                    className={cn(
                      "truncate",
                      hasUnreadThreads && "font-semibold",
                    )}
                  >
                    Threads
                  </span>
                  {hasUnreadThreads ? (
                    <span
                      aria-hidden
                      className="ml-auto size-2 rounded-full bg-sidebar-foreground"
                    />
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={Boolean(
                    matchRoute({
                      to: "/activity",
                    }),
                  )}
                  render={<Link to="/activity" />}
                >
                  <ActivityIcon />
                  <span
                    className={cn(
                      "truncate",
                      hasUnreadActivity && "font-semibold",
                    )}
                  >
                    Activity
                  </span>
                  {hasUnreadActivity ? (
                    <span
                      aria-hidden
                      className="ml-auto size-2 rounded-full bg-sidebar-foreground"
                    />
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarMenu>
            {channelConversations.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No channels yet
                </div>
              </SidebarMenuItem>
            ) : (
              sortedChannelConversations.map((conversation) => (
                <SidebarConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  icon={HashIcon}
                  matchRoute={matchRoute}
                />
              ))
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
                  <SidebarMenuButton
                    closeOnClick={false}
                    className="text-sidebar-foreground/70"
                  >
                    <PlusIcon className="text-sidebar-foreground/70" />
                    <span>Add Channel</span>
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>

          {groupConversations.length > 0 ? (
            <>
              <SidebarGroupLabel className="mt-4">Groups</SidebarGroupLabel>
              <SidebarMenu>
                {sortedGroupConversations.map((conversation) => (
                  <SidebarConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    label={getGroupConversationName(
                      conversation,
                      currentUserId,
                      membersById,
                    )}
                    icon={UsersIcon}
                    matchRoute={matchRoute}
                  />
                ))}
              </SidebarMenu>
            </>
          ) : null}

          <SidebarGroupLabel className="mt-4">Members</SidebarGroupLabel>
          <SidebarMenu>
            {members.length === 0 ? (
              <SidebarMenuItem>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  No members yet
                </div>
              </SidebarMenuItem>
            ) : (
              sortedMembers.map((member) => {
                const conversation = directConversationsByMemberId.get(
                  member.id,
                )
                const isActive = Boolean(
                  matchRoute({
                    to: "/c/$conversationId",
                    params: { conversationId: conversation?.id ?? "" },
                  }) ||
                  matchRoute({
                    to: "/new",
                    search: { members: member.id },
                  }),
                )
                const isMuted = conversation
                  ? isConversationMuted(conversation)
                  : false
                const hasUnread = conversation
                  ? !isMuted && hasUnreadMessages(conversation)
                  : false

                return (
                  <SidebarMenuItem key={member.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => {
                        void handleOpenMemberConversation(
                          member.id,
                          conversation?.id,
                        )
                      }}
                    >
                      <Avatar className="size-5">
                        <AvatarImage
                          src={member.imageUrl ?? undefined}
                          alt={member.name}
                        />
                        <AvatarFallback className="text-[10px]">
                          {getFallbackText(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "truncate",
                          hasUnread && "font-semibold",
                          isMuted && !isActive && "text-sidebar-foreground/60",
                        )}
                      >
                        {member.name}
                      </span>
                      {isMuted ? (
                        <BellOffIcon
                          aria-hidden
                          className={cn(
                            "ml-auto size-3.5",
                            isActive
                              ? "text-sidebar-foreground/70"
                              : "text-sidebar-foreground/40",
                          )}
                        />
                      ) : null}
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
                <SidebarMenuButton
                  isActive={Boolean(
                    matchRoute({
                      to: "/search",
                    }),
                  )}
                  render={<Link to="/search" />}
                >
                  <SearchIcon />
                  <span>Search</span>
                </SidebarMenuButton>
                <SidebarMenuButton onClick={dispatchOpenAppCommandEvent}>
                  <CommandIcon />
                  <span>Open</span>
                  <span className="ml-auto text-xs text-sidebar-foreground/70">
                    ⌘K
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<a href={sessionData.adminUrl} target="_blank" />}
                >
                  <Settings2Icon />
                  <span>Admin</span>
                  <ExternalLinkIcon className="ml-auto opacity-70" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {canSwitchDevUser ? (
              <DevUserSwitcher
                currentUserId={currentUserId}
                members={members}
              />
            ) : null}
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
                    closeOnClick={false}
                    size="lg"
                    className="aria-expanded:bg-muted"
                  />
                }
              >
                <>
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage
                      src={sessionData.session.imageUrl ?? undefined}
                      alt={sessionData.session.name}
                    />
                    <AvatarFallback className="rounded-lg">
                      {getFallbackText(sessionData.session.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {sessionData.session.name}
                    </span>
                    <span className="truncate text-xs text-foreground/70">
                      {sessionData.session.id}
                    </span>
                  </div>
                </>
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
