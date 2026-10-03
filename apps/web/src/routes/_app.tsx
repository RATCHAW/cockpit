import { SidebarInset, SidebarProvider, SidebarTrigger } from "@cockpit/ui/components/sidebar"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { AppSidebar } from "~/components/app-sidebar"
import { sessionQueryOptions } from "~/lib/session"

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (!session) {
      throw redirect({
        to: "/login",
        search: location.href === "/" ? {} : { redirect: location.href },
      })
    }
  },
  component: AppLayout,
})

function AppLayout() {
  const { data: session } = useSuspenseQuery(sessionQueryOptions)
  // beforeLoad guarantees a session; this guards the moment between sign-out and redirect.
  if (!session) return null

  return (
    <SidebarProvider>
      <AppSidebar user={session.user} />
      <SidebarInset className="bg-canvas">
        <header className="flex h-14 items-center gap-2 px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <div className="flex-1 p-6 md:p-10">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
