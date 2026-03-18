"use client"

import type { JSONContent } from "@tiptap/react"
import { PlusIcon, XIcon } from "lucide-react"
import type { ChangeEvent } from "react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChatInput,
  ChatInputBulletListButton,
  ChatInputEditor,
  ChatInputGroupAddon,
  ChatInputMention,
  ChatInputSubmitButton,
  createMentionConfig,
  useChatInput,
} from "@/components/ui/chat-input"
import { cn } from "@/lib/utils"

export type AppChatInputHandle = {
  clear: () => void
  focus: () => void
}

type AppChatInputProps = {
  onSubmit: (content: string) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  className?: string
}

type DemoMember = {
  id: string
  name: string
  image?: string
  type: string
}

const demoMembers: DemoMember[] = [
  { id: "1", name: "Alice", type: "agent" },
  { id: "2", name: "Bob", type: "user" },
  { id: "3", name: "Charlie", type: "bot" },
  { id: "4", name: "Dana", type: "agent" },
]

function serializeChatInputValue(
  node: JSONContent | undefined,
  mentionTriggers: Map<string, string>,
  indent = 0,
): string {
  if (!node) {
    return ""
  }

  if (node.type === "text") {
    return node.text ?? ""
  }

  if (node.type === "hardBreak") {
    return "\n"
  }

  if (node.type?.endsWith("-mention")) {
    const mentionType = node.type.slice(0, -8)
    const trigger = mentionTriggers.get(mentionType) ?? "@"
    const label = typeof node.attrs?.label === "string" ? node.attrs.label : ""
    return label ? `${trigger}${label}` : ""
  }

  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item) => serializeBulletListItem(item, mentionTriggers, indent))
      .filter(Boolean)
      .join("\n")
  }

  if (node.type === "orderedList") {
    return (node.content ?? [])
      .map((item, index) =>
        serializeOrderedListItem(item, mentionTriggers, index + 1, indent),
      )
      .filter(Boolean)
      .join("\n")
  }

  if (node.type === "paragraph") {
    return (node.content ?? [])
      .map((child) => serializeChatInputValue(child, mentionTriggers, indent))
      .join("")
  }

  const childContent = (node.content ?? [])
    .map((child) => serializeChatInputValue(child, mentionTriggers, indent))
    .filter(Boolean)

  if (node.type === "doc") {
    return childContent.join("\n\n").trim()
  }

  return childContent.join("")
}

function serializeBulletListItem(
  node: JSONContent,
  mentionTriggers: Map<string, string>,
  indent: number,
): string {
  const lines: string[] = []

  for (const child of node.content ?? []) {
    if (child.type === "paragraph") {
      const text = serializeChatInputValue(child, mentionTriggers, indent).trim()
      if (text) {
        lines.push(`${" ".repeat(indent)}- ${text}`)
      }
      continue
    }

    if (child.type === "bulletList" || child.type === "orderedList") {
      const nested = serializeChatInputValue(child, mentionTriggers, indent + 2)
      if (nested) {
        lines.push(nested)
      }
      continue
    }

    const text = serializeChatInputValue(child, mentionTriggers, indent).trim()
    if (text) {
      lines.push(`${" ".repeat(indent)}- ${text}`)
    }
  }

  return lines.join("\n")
}

function serializeOrderedListItem(
  node: JSONContent,
  mentionTriggers: Map<string, string>,
  index: number,
  indent: number,
): string {
  const lines: string[] = []

  for (const child of node.content ?? []) {
    if (child.type === "paragraph") {
      const text = serializeChatInputValue(child, mentionTriggers, indent).trim()
      if (text) {
        lines.push(`${" ".repeat(indent)}${index}. ${text}`)
      }
      continue
    }

    if (child.type === "bulletList" || child.type === "orderedList") {
      const nested = serializeChatInputValue(child, mentionTriggers, indent + 3)
      if (nested) {
        lines.push(nested)
      }
      continue
    }

    const text = serializeChatInputValue(child, mentionTriggers, indent).trim()
    if (text) {
      lines.push(`${" ".repeat(indent)}${index}. ${text}`)
    }
  }

  return lines.join("\n")
}

export const AppChatInput = forwardRef<AppChatInputHandle, AppChatInputProps>(
  function AppChatInput(
    {
      onSubmit,
      onStop,
      isStreaming = false,
      disabled = false,
      autoFocus = false,
      placeholder = "Type a message...",
      className,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedAttachments, setSelectedAttachments] = useState<File[]>([])
    const mentionConfigs = useMemo(
      () => ({
        member: createMentionConfig<DemoMember>({
          type: "member",
          trigger: "@",
          items: demoMembers,
        }),
      }),
      [],
    )
    const { value, onChange, clear } = useChatInput({
      mentions: mentionConfigs,
    })
    const serializedContent = useMemo(() => {
      return serializeChatInputValue(
        value,
        new Map([[mentionConfigs.member.type, mentionConfigs.member.trigger]]),
      )
    }, [mentionConfigs, value])

    const focus = useCallback(() => {
      requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLElement>('[contenteditable="true"]')
          ?.focus()
      })
    }, [])

    const clearAndFocus = useCallback(() => {
      clear()
      focus()
    }, [clear, focus])

    const handleAttachmentButtonClick = useCallback(() => {
      fileInputRef.current?.click()
    }, [])

    const handleAttachmentChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        const nextFiles = Array.from(event.target.files ?? [])
        if (nextFiles.length === 0) {
          return
        }

        setSelectedAttachments((current) => {
          const seen = new Set(
            current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
          )
          const uniqueNewFiles = nextFiles.filter((file) => {
            const key = `${file.name}:${file.size}:${file.lastModified}`
            if (seen.has(key)) {
              return false
            }

            seen.add(key)
            return true
          })

          return [...current, ...uniqueNewFiles]
        })

        event.target.value = ""
      },
      [],
    )

    const removeAttachment = useCallback((indexToRemove: number) => {
      setSelectedAttachments((current) =>
        current.filter((_, index) => index !== indexToRemove),
      )
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        clear: clearAndFocus,
        focus,
      }),
      [clearAndFocus, focus],
    )

    useEffect(() => {
      if (!autoFocus) {
        return
      }

      focus()
    }, [autoFocus, focus])

    const handleSubmit = useCallback(() => {
      const content = serializedContent.trim()
      if (!content || disabled || isStreaming) {
        return
      }

      onSubmit(content)
      clear()
      focus()
    }, [clear, disabled, focus, isStreaming, onSubmit, serializedContent])

    const isSendDisabled = disabled || (!isStreaming && serializedContent.trim().length === 0)

    return (
      <div ref={rootRef} className={cn("w-full", className)}>
        <ChatInput
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          onStop={onStop}
          isStreaming={isStreaming}
          className="min-h-0 rounded-2xl border-border/70 bg-card shadow-sm focus-within:ring-0 has-disabled:bg-card has-disabled:opacity-100"
        >
          <ChatInputMention
            type={mentionConfigs.member.type}
            trigger={mentionConfigs.member.trigger}
            items={mentionConfigs.member.items}
          >
            {(item) => (
              <>
                <Avatar className="h-6 w-6">
                  <AvatarImage src={item.image} alt={item.name} />
                  <AvatarFallback>{item.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span
                  className="max-w-[140px] truncate text-sm font-medium"
                  title={item.name}
                >
                  {item.name}
                </span>
                <Badge variant="outline" className="ml-auto">
                  {item.type}
                </Badge>
              </>
            )}
          </ChatInputMention>
          <ChatInputEditor
            placeholder={`${placeholder} Use @ for people, or start a list with "- "`}
            className="max-h-48 min-h-0 px-4 py-3"
          />
          {selectedAttachments.length > 0 ? (
            <div className="border-t border-border/70 px-3 py-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedAttachments.map((attachment, index) => (
                  <div
                    key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}
                    className="flex min-w-[180px] shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2"
                  >
                    <span className="truncate text-sm">{attachment.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto rounded-full"
                      onClick={() => removeAttachment(index)}
                      aria-label={`Remove ${attachment.name}`}
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="px-1 pt-1 text-xs text-muted-foreground">
                Attachments are selected locally only in AI chat for now.
              </div>
            </div>
          ) : null}
          <ChatInputGroupAddon
            align="block-end"
            className="justify-between border-t border-border/70 px-2 py-2"
          >
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label="Attach file"
                onClick={handleAttachmentButtonClick}
              >
                <PlusIcon />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAttachmentChange}
                aria-label="Select files to attach"
              />
              <ChatInputBulletListButton />
            </div>
            <ChatInputSubmitButton
              variant={isStreaming ? "secondary" : "default"}
              className="rounded-full"
              disabled={isSendDisabled}
              aria-label={isStreaming ? "Stop response" : "Send message"}
            />
          </ChatInputGroupAddon>
        </ChatInput>
      </div>
    )
  },
)
