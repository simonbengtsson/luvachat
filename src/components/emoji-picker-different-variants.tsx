"use client";

import { Smile } from "lucide-react";

import EmojiPicker from "@/components/shadcnblocks/emoji-picker";
import { Button } from "@/components/ui/button";

export const title = "Emoji Picker with Different Button Variants";

const EmojiPickerExample = () => {
  const handleEmojiSelect = (emoji: string) => {
    console.log("Selected emoji:", emoji);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Default Variant</p>
        <EmojiPicker
          onEmojiSelect={handleEmojiSelect}
          trigger={
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
            >
              <Smile className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Outline Variant</p>
        <EmojiPicker
          onEmojiSelect={handleEmojiSelect}
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
            >
              <Smile className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Ghost Variant</p>
        <EmojiPicker
          onEmojiSelect={handleEmojiSelect}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
            >
              <Smile className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Secondary Variant</p>
        <EmojiPicker
          onEmojiSelect={handleEmojiSelect}
          trigger={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
            >
              <Smile className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Destructive Variant</p>
        <EmojiPicker
          onEmojiSelect={handleEmojiSelect}
          trigger={
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
            >
              <Smile className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Link Variant</p>
        <EmojiPicker
          onEmojiSelect={handleEmojiSelect}
          trigger={
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
            >
              <Smile className="h-4 w-4" />
            </Button>
          }
        />
      </div>
    </div>
  );
};

export default EmojiPickerExample;
