import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { isCloudflareAccessConfigError } from "@/core/cloudflareAccess"
import { AlertCircleIcon } from "lucide-react"

type GlobalErrorPageProps = {
  error?: unknown
}

export function GlobalErrorPage({ error }: GlobalErrorPageProps) {
  const isCloudflareAccessError = isCloudflareAccessConfigError(error)
  const message =
    isCloudflareAccessError && error instanceof Error
      ? error.message
      : "Something went wrong. Please try again."

  return (
    <GlobalStatusPage
      title={
        isCloudflareAccessError ? "Cloudflare Access setup needed" : "Something went wrong"
      }
      message={message}
      icon={<AlertCircleIcon />}
    />
  )
}
