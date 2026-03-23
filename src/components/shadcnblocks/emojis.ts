import emojiData from "emojibase-data/en/data.json";
import emojiMessages from "emojibase-data/en/messages.json";

import type { Emoji } from "emojibase";

export interface PickerEmoji {
  code: string[];
  emoji: string;
  name: string;
  category: string;
  subcategory: string;
  keywords?: string[];
}

const formatCategory = (value: string) =>
  value
    .split(" ")
    .map((word) =>
      word === "&" ? word : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");

const categoryNames = emojiMessages.groups.map((group) =>
  formatCategory(group.message),
);

const subcategoryKeys = emojiMessages.subgroups.map((subgroup) => subgroup.key);

const isPickerEmoji = (
  emoji: Emoji,
): emoji is Emoji & { group: number; subgroup: number; order: number } =>
  typeof emoji.group === "number" &&
  typeof emoji.subgroup === "number" &&
  typeof emoji.order === "number" &&
  emojiMessages.groups[emoji.group]?.key !== "component";

export const emojis: PickerEmoji[] = emojiData
  .filter(isPickerEmoji)
  .map((emoji) => ({
    code: emoji.hexcode.split("-"),
    emoji: emoji.emoji,
    name: emoji.label,
    category: categoryNames[emoji.group],
    subcategory: subcategoryKeys[emoji.subgroup],
    keywords: emoji.tags,
  }));
