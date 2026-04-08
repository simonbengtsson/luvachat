import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { SearchXIcon } from "lucide-react"

export function GlobalNotFoundPage() {
  return (
    <GlobalStatusPage
      title="Not found"
      message="This page does not exist."
      icon={<SearchXIcon />}
    />
  )
}
