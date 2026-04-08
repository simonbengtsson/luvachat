import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { AlertCircleIcon } from "lucide-react"
import type { ErrorComponentProps } from "@tanstack/react-router"

export function GlobalErrorPage({}: ErrorComponentProps) {
  return (
    <GlobalStatusPage
      title="Something went wrong"
      message="Something went wrong. Please try again."
      icon={<AlertCircleIcon />}
    />
  )
}
