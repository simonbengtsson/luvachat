import { AppShellErrorBoundary } from "@/components/AppShellErrorBoundary"
import { GlobalNotFoundPage } from "@/components/GlobalNotFoundPage"
import { AppCommand } from "@/components/app-command"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { initializeSyncConnection } from "@/core/clientConnection"
import { queryClient } from "@/core/queryClient"
import { getDeploymentInfo } from "@/route.functions"
import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import {
  HeadContent,
  Scripts,
  createRootRoute,
  useLocation,
} from "@tanstack/react-router"
import { useEffect } from "react"
import appCss from "../styles.css?url"

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
        title: "Luvachat",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
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
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <AppSidebar variant="inset" />
          <SidebarInset className="flex h-screen flex-col overflow-hidden">
            <AppShellContent>{children}</AppShellContent>
          </SidebarInset>
          <AppCommand />
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const deploymentInfoQuery = useQuery({
    queryKey: ["deployment-info"],
    queryFn: () => getDeploymentInfo(),
    staleTime: Infinity,
  })

  return (
    <>
      {deploymentInfoQuery.data?.mode === "demo" ? <DemoModeBanner /> : null}
      {children}
    </>
  )
}

function DemoModeBanner() {
  return (
    <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100">
      <span className="font-medium">Demo mode.</span>{" "}
      This deployment is not connected to Luvabase or Cloudflare Access.{" "}
      <a
        className="font-medium underline underline-offset-2"
        href="https://github.com/simonbengtsson/luvachat#cloudflare-access"
        target="_blank"
        rel="noreferrer"
      >
        Read more
      </a>
      .
    </div>
  )
}
