import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ActivityIcon,
  MessageSquareTextIcon,
  SquarePenIcon,
} from "lucide-react"
import type { ComponentProps } from "react"

function SidebarLoaderItem({ avatar = false }: { avatar?: boolean }) {
  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-2 py-2">
        <Skeleton
          className={avatar ? "size-6 rounded-full" : "size-4 rounded-sm"}
        />
        <Skeleton className="h-4 w-28" />
      </div>
    </SidebarMenuItem>
  )
}

export function AppSidebarLoader(props: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <SquarePenIcon />
                  <span>New Message</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <MessageSquareTextIcon />
                  <span>Threads</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <ActivityIcon />
                  <span>Activity</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarMenu>
            {Array.from({ length: 4 }).map((_, index) => (
              <SidebarLoaderItem key={`conversation-skeleton-${index}`} />
            ))}
          </SidebarMenu>

          <SidebarGroupLabel className="mt-4">Members</SidebarGroupLabel>
          <SidebarMenu>
            {Array.from({ length: 3 }).map((_, index) => (
              <SidebarLoaderItem key={`member-skeleton-${index}`} avatar />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <Skeleton className="size-8 rounded-lg" />
              <div className="grid flex-1 gap-1 text-left">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
