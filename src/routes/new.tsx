import {
  AppChatInput,
  type AppChatInputHandle,
} from "@/components/app-chat-input"
import { SiteHeader } from "@/components/site-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getSyncConnectionStatus,
  subscribeToSyncConnectionStatus,
} from "@/core/clientConnection"
import {
  conversationQueryKey,
  conversationsQueryKey,
} from "@/core/conversationsQuery"
import { useWorkspaceMembers } from "@/core/members"
import { orpcClient } from "@/core/orpcClient"
import { applyMessageCreatedToCache } from "@/core/realtimeCache"
import type { ConversationWithUserState } from "@/core/schema"
import type { Member } from "@luvabase/sdk"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { JSONContent } from "@tiptap/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { LoaderCircleIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { z } from "zod"

const newMessageSearchSchema = z.object({
  members: z.string().optional(),
})

export const Route = createFileRoute("/new")({
  validateSearch: newMessageSearchSchema,
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
        .map((item) => item.trim())
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
  const membersQuery = useWorkspaceMembers()
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<AppChatInputHandle>(null)
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const selectedMemberIds = parseMemberIds(search.members)
  const syncConnectionStatus = useSyncExternalStore(
    subscribeToSyncConnectionStatus,
    getSyncConnectionStatus,
    getSyncConnectionStatus,
  )
  const isSyncConnected = syncConnectionStatus === "connected"

  const members = membersQuery.data ?? []
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

  const selectedMembers = selectedMemberIds.map((memberId) => ({
    id: memberId,
    member: membersById.get(memberId) ?? null,
  }))

  const filteredMembers = members.filter(
    (member) =>
      !selectedMemberIds.includes(member.id) && matchesMember(member, query),
  )

  const sendDirectMessageMutation = useMutation({
    mutationFn: ({
      content,
      tiptapJson,
      attachments,
      conversationName,
    }: {
      content: string
      tiptapJson: string | null
      attachments: File[]
      conversationName?: string
    }) =>
      orpcClient.sendDirectMessage({
        memberIds: selectedMemberIds,
        content,
        tiptapJson,
        attachments,
        conversationName,
      }),
    onSuccess: async ({ conversation, message }) => {
      const conversationWithUserState: ConversationWithUserState = {
        ...conversation,
        lastViewedAt: message.createdAt,
        lastMessageAt: message.createdAt,
      }

      queryClient.setQueryData<ConversationWithUserState[]>(
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
      applyMessageCreatedToCache(queryClient, message, {
        markViewed: true,
      })

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

  function updateSelectedMembers(nextMemberIds: string[]) {
    const nextSearch = nextMemberIds.join(",")

    navigate({
      to: "/new",
      search: nextSearch ? { members: nextSearch } : {},
      replace: true,
    })
  }

  function handleAddMember(memberId: string) {
    if (selectedMemberIds.includes(memberId)) {
      return
    }

    updateSelectedMembers([...selectedMemberIds, memberId])
    setQuery("")
    setIsOpen(true)
    inputRef.current?.focus()
  }

  function handleRemoveMember(memberId: string) {
    updateSelectedMembers(
      selectedMemberIds.filter(
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
    if (
      !isSyncConnected ||
      sendDirectMessageMutation.isPending ||
      selectedMemberIds.length === 0 ||
      (!content.trim() && attachments.length === 0)
    ) {
      return
    }

    const conversationName = selectedMembers
      .map(({ id, member }) => member?.name?.trim() || id)
      .filter(Boolean)
      .join(", ")

    sendDirectMessageMutation.mutate({
      content,
      tiptapJson: content.trim() ? JSON.stringify(tiptapDocument) : null,
      attachments,
      conversationName: conversationName || undefined,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SiteHeader title="New message" />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="px-4 py-6 lg:px-8">
            <div className="relative max-w-5xl" ref={pickerRef}>
              <div className="grid gap-3 md:grid-cols-[56px_minmax(0,1fr)] md:items-start">
                <div className="pt-3 text-sm font-medium text-muted-foreground">
                  To:
                </div>
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
                        autoFocus
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
                      {membersQuery.isLoading ? (
                        <div className="space-y-2 p-2">
                          {Array.from({ length: 4 }).map((_, index) => (
                            <div
                              key={`new-message-member-skeleton-${index}`}
                              className="flex items-center gap-3 px-2 py-1.5"
                            >
                              <Skeleton className="size-8 rounded-full" />
                              <Skeleton className="h-4 w-40" />
                            </div>
                          ))}
                        </div>
                      ) : filteredMembers.length > 0 ? (
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
                                <div className="truncate font-medium">
                                  {member.name}
                                </div>
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
          </div>
        </div>

        <div className="shrink-0 bg-background px-4 pb-5">
          <div className="flex flex-col gap-2">
            <AppChatInput
              ref={composerRef}
              autoFocus={selectedMemberIds.length > 0}
              onSubmit={submitMessage}
              disabled={
                !isSyncConnected ||
                sendDirectMessageMutation.isPending ||
                selectedMemberIds.length === 0
              }
              placeholder={
                selectedMemberIds.length > 0
                  ? "Jot something down"
                  : "Select at least one member to start chatting"
              }
              clearOnSubmit={false}
              allowAttachmentsWithoutText
            />
            {selectedMemberIds.length === 0 ? (
              <div className="px-1 text-xs text-muted-foreground">
                Choose at least one member to start a conversation.
              </div>
            ) : !isSyncConnected ? (
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
      </main>
    </div>
  )
}
