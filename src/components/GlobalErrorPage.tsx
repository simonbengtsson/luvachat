import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { AlertCircleIcon } from "lucide-react"

export function GlobalErrorPage() {
  return (
    <GlobalStatusPage
      title="Something went wrong"
      message="Something went wrong. Please try again."
      icon={<AlertCircleIcon />}
    />
  )
}
