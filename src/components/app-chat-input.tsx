"use client"

import { ClientOnly } from "@tanstack/react-router"
import { forwardRef, lazy, Suspense } from "react"

import type {
  AppChatInputHandle,
  AppChatInputProps,
} from "@/components/app-chat-input.client"

export type {
  AppChatInputHandle,
  AppChatInputProps,
} from "@/components/app-chat-input.client"

const LazyAppChatInput = lazy(async () => {
  const module = await import("@/components/app-chat-input.client")
  return { default: module.AppChatInput }
})

function AppChatInputFallback({ className }: { className?: string }) {
  return (
    <div
      className={[
        "min-h-28 rounded-2xl border border-border bg-background",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  )
}

export const AppChatInput = forwardRef<AppChatInputHandle, AppChatInputProps>(
  function AppChatInput(props, ref) {
    const fallback = <AppChatInputFallback className={props.className} />

    return (
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <LazyAppChatInput {...props} ref={ref} />
        </Suspense>
      </ClientOnly>
    )
  },
)
