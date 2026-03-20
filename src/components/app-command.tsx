import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { conversationsQueryOptions } from "@/core/conversationsQuery"
import { useQuery } from "@tanstack/react-query"
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
  const conversationsQuery = useQuery(conversationsQueryOptions())

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

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Jump to a conversation"
    >
      <Command className="rounded-none border-0">
        <CommandInput placeholder="Search conversations..." />
        <CommandList>
          <CommandEmpty>No conversations found.</CommandEmpty>
          <CommandGroup heading="Conversations">
            {conversationsQuery.data?.map((conversation) => (
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
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
