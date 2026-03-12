import type { ParsedLocation } from "@tanstack/react-router"

export function getScrollRestorationKey(location: ParsedLocation) {
  return `${location.pathname}${location.searchStr}`
}
