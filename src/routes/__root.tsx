import { AppShellErrorBoundary } from "@/components/AppShellErrorBoundary"
import { GlobalErrorPage } from "@/components/GlobalErrorPage"
import { GlobalNotFoundPage } from "@/components/GlobalNotFoundPage"
import { AppCommand } from "@/components/app-command"
import { AppSidebar } from "@/components/app-sidebar"
import { DevUserSwitcher } from "@/components/dev-user-switcher"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { initializeSyncConnection } from "@/core/clientConnection"
import { useWorkspaceMembers } from "@/core/members"
import { queryClient } from "@/core/queryClient"
import { getSidebarSession } from "@/route.functions"
import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import {
  HeadContent,
  Scripts,
  createRootRoute,
  useLocation,
} from "@tanstack/react-router"
import { useEffect } from "react"
import appCss from "../styles.css?url"

type SidebarSessionData = Awaited<ReturnType<typeof getSidebarSession>>
type ReadySidebarSessionData = SidebarSessionData & {
  session: NonNullable<SidebarSessionData["session"]>
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "Luvachat",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "theme-color",
        content: "#fafafa",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#171717",
        media: "(prefers-color-scheme: dark)",
      },
      {
        title: "Luvachat",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon-96x96.png",
        sizes: "96x96",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "shortcut icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
    ],
  }),
  notFoundComponent: GlobalNotFoundPage,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                const media = window.matchMedia("(prefers-color-scheme: dark)");
                media.addEventListener("change", () => {
                  document.documentElement.classList.toggle("dark", media.matches);
                });
                document.documentElement.classList.toggle("dark", media.matches);
              })();
            `,
          }}
        />
      </head>
      <body>
        <AppShellErrorBoundary resetKey={location.href}>
          <RootAppShell>{children}</RootAppShell>
        </AppShellErrorBoundary>
        <Scripts />
      </body>
    </html>
  )
}

function RootAppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => initializeSyncConnection(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShellFrame>{children}</AppShellFrame>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function AppShellFrame({ children }: { children: React.ReactNode }) {
  const sessionQuery = useQuery({
    queryKey: ["sidebar-session"],
    queryFn: () => getSidebarSession(),
  })
  const sessionData = sessionQuery.data
  const hasSession = Boolean(sessionData?.session)
  const isDemoMode = hasSession && sessionData?.deploymentMode === "demo"

  if (sessionQuery.error) {
    return <GlobalErrorPage error={sessionQuery.error} />
  }

  if (sessionData?.setupError) {
    return (
      <GlobalErrorPage
        cloudflareAccessMessage={sessionData.setupError}
      />
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sidebar">
      {isDemoMode && sessionData?.session ? (
        <DemoModeBanner sessionData={sessionData} />
      ) : null}
      <SidebarProvider
        className="min-h-0 flex-1"
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
            "--sidebar-offset-top": isDemoMode
              ? "calc(var(--spacing) * 10)"
              : "0px",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="flex h-full min-h-0 flex-col overflow-hidden">
          {children}
        </SidebarInset>
        <AppCommand />
      </SidebarProvider>
    </div>
  )
}

function DemoModeBanner({
  sessionData,
}: {
  sessionData: ReadySidebarSessionData
}) {
  const membersQuery = useWorkspaceMembers()
  const members = membersQuery.data

  return (
    <div className="min-h-10 w-full shrink-0 border-b border-white/20 bg-[#f39c12] px-4 py-1.5 text-sm leading-5 text-white">
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-medium">Demo mode.</span>{" "}
        <span>Not connected to Cloudflare Access. </span>
        <a
          className="font-medium text-white underline underline-offset-2 hover:text-white/90"
          href="https://github.com/simonbengtsson/luvachat#cloudflare-access"
          target="_blank"
          rel="noreferrer"
        >
          Read more
        </a>
        <span>.</span>
        <span className="mx-2 text-white/70">|</span>
        <DevUserSwitcher
          currentUserId={sessionData.session.id}
          members={members || []}
        />
      </div>
    </div>
  )
}
