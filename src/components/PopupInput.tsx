import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CheckIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export function PopupInput(props: {
  trigger: React.ReactElement
  onSubmit: (value: string) => void
  placeholder?: string
  defaultValue?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = props.open !== undefined
  const open = isControlled ? props.open : internalOpen
  const setOpen = isControlled
    ? (v: boolean) => props.onOpenChange?.(v)
    : setInternalOpen

  useEffect(() => {
    if (open && inputRef.current && props.defaultValue !== undefined) {
      inputRef.current.value = props.defaultValue
      inputRef.current.select()
    }
  }, [open, props.defaultValue])

  async function handleSubmit() {
    const value = inputRef.current?.value?.trim()
    if (!value) return
    setOpen(false)
    props.onSubmit(value)
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={props.trigger} />
      <PopoverContent className="flex flex-row gap-2">
        <Input
          placeholder={props.placeholder || "Write here..."}
          className="focus:outline-none focus-visible:ring-0"
          ref={inputRef}
          defaultValue={props.defaultValue}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <Button variant="outline" size="icon" onClick={handleSubmit}>
          <CheckIcon />
        </Button>
      </PopoverContent>
    </Popover>
  )
}
