"use client";

import {
  Activity,
  Clock,
  Flag,
  Lightbulb,
  MapPin,
  Search,
  Smile,
  Users,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emojis } from "@/components/shadcnblocks/emojis";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  trigger?: React.ReactElement;
  maxRecentEmojis?: number;
}

const categoryIcons = {
  "Smileys & Emotion": Smile,
  "People & Body": Users,
  "Animals & Nature": Activity,
  "Food & Drink": Activity,
  "Travel & Places": MapPin,
  Activities: Activity,
  Objects: Lightbulb,
  Symbols: Flag,
  Flags: Flag,
};

interface EmojiGridProps {
  emojis: typeof emojis;
  showCategory?: boolean;
  selectedIndex: number;
  allVisibleEmojis: typeof emojis;
  onEmojiClick: (emoji: string) => void;
  setSelectedIndex: (index: number) => void;
  emojiGridRef: React.RefObject<HTMLDivElement | null>;
}

const EmojiGrid = ({
  emojis: emojiList,
  showCategory = false,
  selectedIndex,
  allVisibleEmojis,
  onEmojiClick,
  setSelectedIndex,
  emojiGridRef,
}: EmojiGridProps) => (
  <div className="grid grid-cols-8 gap-1 p-2" ref={emojiGridRef}>
    {emojiList.map((emoji, index) => {
      const globalIndex = showCategory
        ? allVisibleEmojis.findIndex((e) => e.emoji === emoji.emoji)
        : index;

      return (
        <Button
          key={`${emoji.emoji}-${index}`}
          variant="ghost"
          size="sm"
          className={`h-10 w-10 p-0 transition-colors hover:bg-accent ${
            selectedIndex === globalIndex ? "bg-accent ring-2 ring-primary" : ""
          }`}
          onClick={() => onEmojiClick(emoji.emoji)}
          title={emoji.name}
          onMouseEnter={() => setSelectedIndex(globalIndex)}
        >
          <span className="text-lg" role="img" aria-label={emoji.name}>
            {emoji.emoji}
          </span>
        </Button>
      );
    })}
  </div>
);

export default function EmojiPicker({
  onEmojiSelect,
  trigger,
  maxRecentEmojis = 24,
}: EmojiPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const emojiGridRef = useRef<HTMLDivElement>(null);

  // Load recent emojis from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("recent-emojis");
    if (stored) {
      try {
        startTransition(() => {
          setRecentEmojis(JSON.parse(stored));
        });
      } catch {
        // Ignore invalid JSON in localStorage
      }
    }
  }, []);

  // Get unique categories with better ordering
  const categories = useMemo(() => {
    const categoryOrder = [
      "Smileys & Emotion",
      "People & Body",
      "Animals & Nature",
      "Food & Drink",
      "Travel & Places",
      "Activities",
      "Objects",
      "Symbols",
      "Flags",
    ];

    const availableCategories = Array.from(
      new Set(emojis.map((emoji) => emoji.category)),
    );
    return categoryOrder.filter((cat) => availableCategories.includes(cat));
  }, []);

  // Enhanced search with keywords and fuzzy matching
  const filteredEmojis = useMemo(() => {
    if (!searchTerm) return emojis;

    const searchLower = searchTerm.toLowerCase();
    return emojis.filter((emoji) => {
      const nameMatch = emoji.name.toLowerCase().includes(searchLower);
      const categoryMatch = emoji.category.toLowerCase().includes(searchLower);

      // Add keyword matching if emoji has keywords property
      const emojiKeywords =
        "keywords" in emoji && Array.isArray(emoji.keywords)
          ? emoji.keywords
          : [];
      const keywordMatch = emojiKeywords.some((keyword: string) =>
        keyword.toLowerCase().includes(searchLower),
      );

      return nameMatch || categoryMatch || keywordMatch;
    });
  }, [searchTerm]);

  // Group emojis by category
  const emojisByCategory = useMemo(() => {
    return categories.reduce(
      (acc, category) => {
        acc[category] = filteredEmojis.filter(
          (emoji) => emoji.category === category,
        );
        return acc;
      },
      {} as Record<string, typeof emojis>,
    );
  }, [categories, filteredEmojis]);

  // Get all visible emojis for keyboard navigation
  const allVisibleEmojis = useMemo(() => {
    if (searchTerm) {
      return filteredEmojis;
    }
    return categories.flatMap((category) => emojisByCategory[category] || []);
  }, [searchTerm, filteredEmojis, categories, emojisByCategory]);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);

    // Update recent emojis
    const newRecent = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(
      0,
      maxRecentEmojis,
    );

    setRecentEmojis(newRecent);
    localStorage.setItem("recent-emojis", JSON.stringify(newRecent));

    setIsOpen(false);
    setSearchTerm("");
    setSelectedIndex(-1);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < allVisibleEmojis.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && allVisibleEmojis[selectedIndex]) {
          handleEmojiClick(allVisibleEmojis[selectedIndex].emoji);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearchTerm("");
        setSelectedIndex(-1);
        break;
    }
  };

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset selection when search changes
  useEffect(() => {
    startTransition(() => {
      setSelectedIndex(-1);
    });
  }, [searchTerm]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          trigger || (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 bg-transparent p-0"
            >
              <Smile className="h-4 w-4" />
              <span className="sr-only">Open emoji picker</span>
            </Button>
          )
        }
      />
      <PopoverContent
        className="w-80 p-0"
        align="end"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search emojis..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
              aria-label="Search emojis"
            />
          </div>

          {/* Search Results Count */}
          {searchTerm && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{filteredEmojis.length} results found</span>
              {filteredEmojis.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Use ↑↓ to navigate, Enter to select
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Search Results */}
        {searchTerm ? (
          <ScrollArea className="h-64">
            {filteredEmojis.length > 0 ? (
              <EmojiGrid
                emojis={filteredEmojis}
                showCategory
                selectedIndex={selectedIndex}
                allVisibleEmojis={allVisibleEmojis}
                onEmojiClick={handleEmojiClick}
                setSelectedIndex={setSelectedIndex}
                emojiGridRef={emojiGridRef}
              />
            ) : (
              <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                <Search className="mb-2 h-8 w-8" />
                <p className="text-sm">No emojis found</p>
                <p className="text-xs">Try a different search term</p>
              </div>
            )}
          </ScrollArea>
        ) : (
          /* Category Tabs */
          <Tabs
            defaultValue={recentEmojis.length > 0 ? "recent" : categories[0]}
            className="w-full"
          >
            <TabsList
              className="grid h-auto w-full p-1"
              style={{
                gridTemplateColumns: `repeat(${recentEmojis.length > 0 ? Math.min(categories.length + 1, 4) : Math.min(categories.length, 4)}, 1fr)`,
              }}
            >
              {recentEmojis.length > 0 && (
                <TabsTrigger
                  value="recent"
                  className="flex items-center gap-1 px-2 py-1 text-xs"
                  title="Recently used"
                >
                  <Clock className="h-3 w-3" />
                  <span className="hidden sm:inline">Recent</span>
                </TabsTrigger>
              )}
              {categories
                .slice(0, recentEmojis.length > 0 ? 3 : 4)
                .map((category) => {
                  const IconComponent =
                    categoryIcons[category as keyof typeof categoryIcons] ||
                    Smile;
                  return (
                    <TabsTrigger
                      key={category}
                      value={category}
                      className="flex items-center gap-1 px-2 py-1 text-xs"
                      title={category}
                    >
                      <IconComponent className="h-3 w-3" />
                      <span className="hidden sm:inline">
                        {category.split(" ")[0]}
                      </span>
                    </TabsTrigger>
                  );
                })}
            </TabsList>

            {/* Recent Emojis Tab */}
            {recentEmojis.length > 0 && (
              <TabsContent value="recent" className="mt-0">
                <ScrollArea className="h-64">
                  <div className="p-2">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Recently Used</span>
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                      {recentEmojis.map((emoji, index) => (
                        <Button
                          key={`recent-${emoji}-${index}`}
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 p-0 transition-colors hover:bg-accent"
                          onClick={() => handleEmojiClick(emoji)}
                          title={`Recently used: ${emoji}`}
                        >
                          <span className="text-lg" role="img">
                            {emoji}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            )}

            {/* Category Tabs */}
            {categories.map((category) => (
              <TabsContent key={category} value={category} className="mt-0">
                <ScrollArea className="h-64">
                  {emojisByCategory[category]?.length > 0 ? (
                    <div className="p-2">
                      <div className="mb-2 flex items-center gap-2 px-1">
                        {(() => {
                          const IconComponent =
                            categoryIcons[
                              category as keyof typeof categoryIcons
                            ] || Smile;
                          return (
                            <IconComponent className="h-4 w-4 text-muted-foreground" />
                          );
                        })()}
                        <span className="text-sm font-medium">{category}</span>
                        <Badge variant="outline" className="text-xs">
                          {emojisByCategory[category].length}
                        </Badge>
                      </div>
                      <EmojiGrid
                        emojis={emojisByCategory[category]}
                        selectedIndex={selectedIndex}
                        allVisibleEmojis={allVisibleEmojis}
                        onEmojiClick={handleEmojiClick}
                        setSelectedIndex={setSelectedIndex}
                        emojiGridRef={emojiGridRef}
                      />
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                      <p className="text-sm">No emojis in this category</p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
