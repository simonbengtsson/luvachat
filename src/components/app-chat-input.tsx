"use client"

import type { Editor, JSONContent } from "@tiptap/react"
import { PlusIcon, SmileIcon, XIcon } from "lucide-react"
import type { ChangeEvent } from "react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import EmojiPicker from "@/components/shadcnblocks/emoji-picker"
import type { Member } from "@/core/luvabase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  useChatInputContext,
} from "@/components/ui/chat-input"
import { cn } from "@/lib/utils"

export type AppChatInputHandle = {
  clear: () => void
  focus: () => void
}

type AppChatInputProps = {
  onSubmit: (
    content: string,
    attachments: File[],
    tiptapDocument: JSONContent,
  ) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  className?: string
  members?: Member[]
  clearOnSubmit?: boolean
  allowAttachmentsWithoutText?: boolean
  attachmentsHelperText?: string | null
}

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

  if (node.type === "blockquote") {
    return (node.content ?? [])
      .map((child) => serializeChatInputValue(child, mentionTriggers, indent))
      .filter(Boolean)
      .join("\n")
  }

  if (node.type === "heading") {
    return (node.content ?? [])
      .map((child) => serializeChatInputValue(child, mentionTriggers, indent))
      .join("")
      .trim()
  }

  if (node.type === "codeBlock") {
    return (node.content ?? [])
      .map((child) => serializeChatInputValue(child, mentionTriggers, indent))
      .join("")
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
        lines.push(`${" ".repeat(indent)}• ${text}`)
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
      lines.push(`${" ".repeat(indent)}• ${text}`)
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

function AppChatInputEmojiButton() {
  const { editor, disabled } = useChatInputContext()

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      if (!editor || disabled) {
        return
      }

      editor.chain().focus().insertContent(emoji).run()
    },
    [disabled, editor],
  )

  return (
    <EmojiPicker
      onEmojiSelect={handleEmojiSelect}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Add emoji"
          disabled={disabled}
        >
          <SmileIcon className="size-4" />
        </Button>
      }
    />
  )
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
      members = [],
      clearOnSubmit = true,
      allowAttachmentsWithoutText = false,
      attachmentsHelperText = null,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<Editor | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedAttachments, setSelectedAttachments] = useState<File[]>([])
    const mentionConfigs = useMemo(
      () => ({
        member: createMentionConfig<Member>({
          type: "member",
          trigger: "@",
          items: members,
        }),
      }),
      [members],
    )
    const mentionTriggers = useMemo(
      () => new Map([[mentionConfigs.member.type, mentionConfigs.member.trigger]]),
      [mentionConfigs],
    )
    const { value, onChange, clear } = useChatInput({
      mentions: mentionConfigs,
    })
    const serializedContent = useMemo(() => {
      return serializeChatInputValue(value, mentionTriggers)
    }, [mentionTriggers, value])

    const focus = useCallback(() => {
      requestAnimationFrame(() => {
        if (editorRef.current && !editorRef.current.isDestroyed) {
          editorRef.current.commands.focus("end", { scrollIntoView: false })
          return
        }

        rootRef.current
          ?.querySelector<HTMLElement>('[contenteditable="true"]')
          ?.focus()
      })
    }, [])

    const resetAttachments = useCallback(() => {
      setSelectedAttachments([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }, [])

    const handleEditorChange = useCallback((editor: Editor | null) => {
      editorRef.current = editor
    }, [])

    const clearAndFocus = useCallback(() => {
      resetAttachments()
      if (editorRef.current && !editorRef.current.isDestroyed) {
        editorRef.current.commands.clearContent()
      } else {
        clear()
      }
      focus()
    }, [clear, focus, resetAttachments])

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
      const hasAttachments = selectedAttachments.length > 0
      if (
        disabled ||
        isStreaming ||
        (!content && (!allowAttachmentsWithoutText || !hasAttachments))
      ) {
        return
      }

      onSubmit(content, selectedAttachments, value)
      if (clearOnSubmit) {
        clearAndFocus()
      }
    }, [
      allowAttachmentsWithoutText,
      clearAndFocus,
      clearOnSubmit,
      disabled,
      isStreaming,
      onSubmit,
      selectedAttachments,
      serializedContent,
      value,
    ])

    const isSendDisabled =
      disabled ||
      (!isStreaming &&
        serializedContent.trim().length === 0 &&
        (!allowAttachmentsWithoutText || selectedAttachments.length === 0))

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
                  <AvatarImage src={item.imageUrl ?? undefined} alt={item.name} />
                  <AvatarFallback>{item.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span
                  className="max-w-[140px] truncate text-sm font-medium"
                  title={item.name}
                >
                  {item.name}
                </span>
              </>
            )}
          </ChatInputMention>
          <ChatInputEditor
            placeholder={`${placeholder} Use @ for people, or start a list with "- "`}
            className="max-h-48 min-h-0 px-4 py-3"
            onEditorChange={handleEditorChange}
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
              {attachmentsHelperText ? (
                <div className="px-1 pt-1 text-xs text-muted-foreground">
                  {attachmentsHelperText}
                </div>
              ) : null}
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
              <AppChatInputEmojiButton />
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
