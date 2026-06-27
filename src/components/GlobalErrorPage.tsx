import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { Button, buttonVariants } from "@/components/ui/button"
import { getAppErrorView, isAppError, type AppErrorView } from "@/core/appError"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { AlertCircleIcon, ExternalLinkIcon, RefreshCcwIcon } from "lucide-react"

type GlobalErrorPageProps = Omit<Partial<ErrorComponentProps>, "error"> & {
  appError?: AppErrorView | null
  error?: unknown
}

export function GlobalErrorPage({
  appError,
  error,
  reset,
}: GlobalErrorPageProps) {
  const appErrorView = appError ??
    (isAppError(error) ? getAppErrorView(error) : null)
  const message = appErrorView?.message ??
    "Something went wrong. Please try again."

  return (
    <GlobalStatusPage
      title={appErrorView?.title ?? "Something went wrong"}
      message={message}
      icon={<AlertCircleIcon />}
      action={
        appErrorView?.action ? (
          <a
            className={buttonVariants({ variant: "outline" })}
            href={appErrorView.action.href}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkIcon />
            {appErrorView.action.label}
          </a>
        ) : reset ? (
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
