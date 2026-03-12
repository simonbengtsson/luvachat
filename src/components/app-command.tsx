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
import { HashIcon } from "lucide-react"
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Jump to a channel"
    >
      <Command className="rounded-none border-0">
        <CommandInput placeholder="Search channels..." />
        <CommandList>
          <CommandEmpty>No channels found.</CommandEmpty>
          <CommandGroup heading="Channels">
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
                <HashIcon />
                {conversation.name ?? conversation.id}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
