import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { isCloudflareAccessConfigError } from "@/core/cloudflareAccess"
import { AlertCircleIcon } from "lucide-react"

type GlobalErrorPageProps = {
  cloudflareAccessMessage?: string
  error?: unknown
}

export function GlobalErrorPage({
  cloudflareAccessMessage,
  error,
}: GlobalErrorPageProps) {
  const isCloudflareAccessError = isCloudflareAccessConfigError(error)
  const message =
    cloudflareAccessMessage ??
    (isCloudflareAccessError && error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.")

  return (
    <GlobalStatusPage
      title={
        cloudflareAccessMessage || isCloudflareAccessError
          ? "Cloudflare Access setup needed"
          : "Something went wrong"
      }
      message={message}
      icon={<AlertCircleIcon />}
    />
  )
}
