import {
  AppChatInput,
  type AppChatInputHandle,
} from "@/components/app-chat-input"
import { SiteHeader } from "@/components/site-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  getSyncConnectionStatus,
  subscribeToSyncConnectionStatus,
} from "@/core/clientConnection"
import {
  conversationQueryKey,
  conversationsQueryKey,
} from "@/core/conversationsQuery"
import type { Member } from "@/core/luvabase"
import { getWorkspaceMembers } from "@/core/members"
import type { EnrichedConversation } from "@/core/models"
import { orpcClient } from "@/core/orpcClient"
import { applyMessageCreatedToCache } from "@/core/realtimeCache"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import type { JSONContent } from "@tiptap/react"
import { LoaderCircleIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

export const Route = createFileRoute("/new")({
  validateSearch: (search) => ({ members: `${search.members || ''}`.trim() }),
  loaderDeps: ({ search }) => ({ members: search.members }),
  loader: async ({ deps }) => {
    const members = await getWorkspaceMembers()
    const memberIds = parseMemberIds(deps.members)
    const memberIdsSet = new Set(members.map((member) => member.id))

    if (memberIds.some((memberId) => !memberIdsSet.has(memberId))) {
      throw notFound()
    }

    return { members }
  },
  component: RouteComponent,
})

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

function parseMemberIds(value?: string) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .filter(Boolean),
    ),
  )
}

function matchesMember(member: Member, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return (
    member.name.toLowerCase().includes(normalizedQuery) ||
    member.id.toLowerCase().includes(normalizedQuery)
  )
}

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = Route.useSearch()
  const { members } = Route.useLoaderData()
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<AppChatInputHandle>(null)
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState(() =>
    parseMemberIds(search.members),
  )
  const hasSelectedMembers = selectedMemberIds.length > 0
  const syncConnectionStatus = useSyncExternalStore(
    subscribeToSyncConnectionStatus,
    getSyncConnectionStatus,
    getSyncConnectionStatus,
  )
  const isSyncConnected = syncConnectionStatus === "connected"

  const membersById = new Map(members.map((member) => [member.id, member]))

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [])

  useEffect(() => {
    setSelectedMemberIds(parseMemberIds(search.members))
  }, [search.members])

  const selectedMembers = selectedMemberIds.map((memberId) => ({
    id: memberId,
    member: membersById.get(memberId) ?? null,
  }))

  const conversationName = selectedMembers
    .map(({ member }) => member?.name?.trim())
    .filter(Boolean)
    .join(", ")

  const filteredMembers = members.filter(
    (member) =>
      !selectedMemberIds.includes(member.id) && matchesMember(member, query),
  )

  const sendDirectMessageMutation = useMutation({
    mutationFn: ({
      memberIds,
      content,
      tiptapJson,
      attachments,
      conversationName,
    }: {
      memberIds: string[]
      content: string
      tiptapJson: string | null
      attachments: File[]
      conversationName?: string
    }) =>
      orpcClient.sendDirectMessage({
        memberIds,
        content,
        tiptapJson,
        attachments,
        conversationName,
      }),
    onSuccess: async ({ conversation, message }, { memberIds }) => {
      const conversationWithUserState: EnrichedConversation = {
        ...conversation,
        memberIds,
        lastViewedAt: message.createdAt,
        lastMessageAt: message.createdAt,
        notificationLevel: "all",
      }

      queryClient.setQueryData<EnrichedConversation[]>(
        conversationsQueryKey,
        (conversations = []) => [
          conversationWithUserState,
          ...conversations.filter((item) => item.id !== conversation.id),
        ],
      )
      queryClient.setQueryData(
        conversationQueryKey(conversation.id),
        conversationWithUserState,
      )
      applyMessageCreatedToCache(queryClient, message)

      await navigate({
        to: "/c/$conversationId",
        params: { conversationId: conversation.id } as any,
        replace: true,
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
    },
  })

  function handleAddMember(memberId: string) {
    if (selectedMemberIds.includes(memberId)) {
      return
    }

    setSelectedMemberIds((currentMemberIds) => [...currentMemberIds, memberId])
    setQuery("")
    setIsOpen(true)
    inputRef.current?.focus()
  }

  function handleRemoveMember(memberId: string) {
    setSelectedMemberIds((currentMemberIds) =>
      currentMemberIds.filter(
        (currentMemberId) => currentMemberId !== memberId,
      ),
    )
    inputRef.current?.focus()
  }

  function submitMessage(
    content: string,
    attachments: File[],
    tiptapDocument: JSONContent,
  ) {
    const memberIds = selectedMemberIds

    if (
      !isSyncConnected ||
      sendDirectMessageMutation.isPending ||
      memberIds.length === 0 ||
      (!content.trim() && attachments.length === 0)
    ) {
      return
    }

    sendDirectMessageMutation.mutate({
      memberIds,
      content,
      tiptapJson: content.trim() ? JSON.stringify(tiptapDocument) : null,
      attachments,
      conversationName: conversationName || undefined,
    })
  }

  const recipientPicker = (
    <div className="relative max-w-5xl" ref={pickerRef}>
      <div className="grid gap-3 md:grid-cols-[56px_minmax(0,1fr)] md:items-start">
        <div className="pt-3 text-sm font-medium text-muted-foreground">To:</div>
        <div className="space-y-0">
          <div
            className="min-h-14 rounded-xl border border-border bg-background px-3 py-2.5 shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15"
            onClick={() => {
              inputRef.current?.focus()
              setIsOpen(true)
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {selectedMembers.map(({ id, member }) => (
                <button
                  key={id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleRemoveMember(id)
                  }}
                  className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm"
                >
                  <Avatar className="size-5">
                    <AvatarImage
                      src={member?.imageUrl ?? undefined}
                      alt={member?.name ?? id}
                    />
                    <AvatarFallback className="text-[10px]">
                      {getFallbackText(member?.name ?? id)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{member?.name ?? id}</span>
                  <XIcon className="size-3.5 text-muted-foreground" />
                </button>
              ))}

              <input
                autoFocus={!hasSelectedMembers}
                ref={inputRef}
                value={query}
                onFocus={() => {
                  setIsOpen(true)
                }}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setIsOpen(true)
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Backspace" &&
                    query.length === 0 &&
                    selectedMemberIds.length > 0
                  ) {
                    event.preventDefault()
                    handleRemoveMember(
                      selectedMemberIds[selectedMemberIds.length - 1]!,
                    )
                    return
                  }

                  if (event.key === "Enter" && filteredMembers[0]) {
                    event.preventDefault()
                    handleAddMember(filteredMembers[0].id)
                    return
                  }

                  if (event.key === "Escape") {
                    setIsOpen(false)
                  }
                }}
                placeholder="@somebody"
                className="h-8 min-w-[220px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {isOpen ? (
            <div className="mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-md">
              {filteredMembers.length > 0 ? (
                <div className="max-h-80 overflow-y-auto p-1">
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        handleAddMember(member.id)
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Avatar className="size-8">
                        <AvatarImage
                          src={member.imageUrl ?? undefined}
                          alt={member.name}
                        />
                        <AvatarFallback className="text-[10px]">
                          {getFallbackText(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{member.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No matching members
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SiteHeader title="New message" />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {hasSelectedMembers ? (
          <>
            <div className="shrink-0 bg-background px-4 py-4">
              <div className="flex max-w-5xl flex-col gap-4">
                {recipientPicker}
                <div className="flex flex-col gap-2">
                  <AppChatInput
                    ref={composerRef}
                    autoFocus
                    onSubmit={submitMessage}
                    members={members}
                    disabled={
                      !isSyncConnected || sendDirectMessageMutation.isPending
                    }
                    placeholder="Jot something down"
                    clearOnSubmit={false}
                    allowAttachmentsWithoutText
                  />
                  {!isSyncConnected ? (
                    <div
                      className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
                      aria-live="polite"
                    >
                      <LoaderCircleIcon className="size-3.5 animate-spin" />
                      <span>Not connected, retrying...</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-muted/10" />
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="px-4 py-6 lg:px-8">
              {recipientPicker}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
