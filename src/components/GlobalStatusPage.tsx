import { SiteHeader } from "@/components/site-header"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { type ReactNode } from "react"

type GlobalStatusPageProps = {
  title: string
  message: string
  icon: ReactNode
  action?: ReactNode
  showHeader?: boolean
}

export function GlobalStatusPage({
  title,
  message,
  icon,
  action,
  showHeader = true,
}: GlobalStatusPageProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showHeader ? <SiteHeader title={title} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Empty className="min-h-full gap-3 px-6 py-10">
          <EmptyHeader className="gap-3">
            <EmptyMedia
              variant="icon"
              className="size-10 rounded-xl [&_svg:not([class*='size-'])]:size-5"
            >
              {icon}
            </EmptyMedia>
            <EmptyDescription className="max-w-sm text-center">
              {message}
            </EmptyDescription>
          </EmptyHeader>
          {action ? <EmptyContent>{action}</EmptyContent> : null}
        </Empty>
      </div>
    </div>
  )
}
