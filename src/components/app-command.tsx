import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useConversations } from "@/core/conversationsQuery"
import { useWorkspaceMembers } from "@/core/members"
import { orpcClient } from "@/core/orpcClient"
import { useNavigate } from "@tanstack/react-router"
import { HashIcon, MessageCircleIcon, UsersIcon } from "lucide-react"
import * as React from "react"
import {
  dispatchOpenAppCommandEvent,
  OPEN_APP_COMMAND_EVENT,
} from "./app-command.events"

export function AppCommand() {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()
  const conversationsQuery = useConversations()
  const membersQuery = useWorkspaceMembers()

  React.useEffect(() => {
    const handleOpen = () => {
      setOpen(true)
    }

    window.addEventListener(OPEN_APP_COMMAND_EVENT, handleOpen)
    return () => {
      window.removeEventListener(OPEN_APP_COMMAND_EVENT, handleOpen)
    }
  }, [])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        dispatchOpenAppCommandEvent()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const getConversationIcon = (type: string) => {
    if (type === "channel") {
      return <HashIcon />
    }

    if (type === "group") {
      return <UsersIcon />
    }

    return <MessageCircleIcon />
  }

  const searchableConversations =
    conversationsQuery.data?.filter((conversation) => conversation.type !== "direct") ?? []

  const getFallbackText = (value?: string | null) => {
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

  async function handleOpenMemberConversation(memberId: string) {
    try {
      const existingConversation =
        await orpcClient.getDirectConversationByMemberIds({
          memberIds: [memberId],
        })

      if (existingConversation) {
        await navigate({
          to: "/c/$conversationId",
          params: { conversationId: existingConversation.id } as any,
        })
        return
      }
    } catch (error) {
      console.error("Failed to resolve direct conversation", error)
    }

    await navigate({
      to: "/new",
      search: { members: memberId },
    })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Jump to a conversation"
    >
      <Command className="rounded-none border-0">
        <CommandInput placeholder="Search conversations or members..." />
        <CommandList>
          <CommandEmpty>No conversations or members found.</CommandEmpty>
          <CommandGroup heading="Conversations">
            {searchableConversations.map((conversation) => (
              <CommandItem
                key={conversation.id}
                value={`${conversation.name ?? ""} ${conversation.id}`}
                onSelect={() => {
                  navigate({
                    to: "/c/$conversationId",
                    params: { conversationId: conversation.id } as any,
                  })
                  setOpen(false)
                }}
              >
                {getConversationIcon(conversation.type)}
                {conversation.name ?? conversation.id}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Members">
            {membersQuery.data?.map((member) => (
              <CommandItem
                key={member.id}
                value={`${member.name} ${member.id}`}
                onSelect={() => {
                  setOpen(false)
                  void handleOpenMemberConversation(member.id)
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
                {member.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
