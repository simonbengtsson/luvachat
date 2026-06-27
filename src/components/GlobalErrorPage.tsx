import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { Button } from "@/components/ui/button"
import { isCloudflareAccessConfigError } from "@/core/cloudflareAccess"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { AlertCircleIcon, RefreshCcwIcon } from "lucide-react"

type GlobalErrorPageProps = Omit<Partial<ErrorComponentProps>, "error"> & {
  cloudflareAccessMessage?: string
  error?: unknown
}

export function GlobalErrorPage({
  cloudflareAccessMessage,
  error,
  reset,
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
      action={
        reset ? (
          <Button variant="outline" onClick={reset}>
            <RefreshCcwIcon />
            Try again
          </Button>
        ) : null
      }
      showHeader={false}
    />
  )
}
