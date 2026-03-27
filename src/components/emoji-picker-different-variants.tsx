"use client"

import { ClientOnly } from "@tanstack/react-router"
import { Smile } from "lucide-react"
import type { ReactElement } from "react"
import { lazy, Suspense } from "react"

import { Button } from "@/components/ui/button"

export const title = "Emoji Picker with Different Button Variants"

const EmojiPicker = lazy(() => import("@/components/shadcnblocks/emoji-picker"))

const EmojiPickerExample = () => {
  const handleEmojiSelect = (emoji: string) => {
    console.log("Selected emoji:", emoji)
  }

  const renderPicker = (trigger: ReactElement) => (
    <ClientOnly fallback={trigger}>
      <Suspense fallback={trigger}>
        <EmojiPicker onEmojiSelect={handleEmojiSelect} trigger={trigger} />
      </Suspense>
    </ClientOnly>
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Default Variant</p>
        {renderPicker(
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
          >
            <Smile className="h-4 w-4" />
          </Button>,
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Outline Variant</p>
        {renderPicker(
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
          >
            <Smile className="h-4 w-4" />
          </Button>,
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Ghost Variant</p>
        {renderPicker(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
          >
            <Smile className="h-4 w-4" />
          </Button>,
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Secondary Variant</p>
        {renderPicker(
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
          >
            <Smile className="h-4 w-4" />
          </Button>,
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Destructive Variant</p>
        {renderPicker(
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
          >
            <Smile className="h-4 w-4" />
          </Button>,
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Link Variant</p>
        {renderPicker(
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
          >
            <Smile className="h-4 w-4" />
          </Button>,
        )}
      </div>
    </div>
  )
}

export default EmojiPickerExample
