import { Button } from "@cockpit/ui/components/button"
import { Toaster } from "@cockpit/ui/components/sonner"
import { TooltipProvider } from "@cockpit/ui/components/tooltip"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Link, Outlet } from "@tanstack/react-router"
import { lazy, Suspense } from "react"

const Devtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ ReactQueryDevtools }, { TanStackRouterDevtools }] = await Promise.all([
        import("@tanstack/react-query-devtools"),
        import("@tanstack/react-router-devtools"),
      ])
      return {
        default: () => (
          <>
            <ReactQueryDevtools buttonPosition="bottom-left" />
            <TanStackRouterDevtools position="bottom-right" />
          </>
        ),
      }
    })
  : () => null

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ title: "Cockpit" }] }),
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <TooltipProvider>
      <HeadContent />
      <Outlet />
      <Toaster position="bottom-right" />
      <Suspense>
        <Devtools />
      </Suspense>
    </TooltipProvider>
  )
}

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="flex max-w-md flex-col items-start gap-6">
        <p className="font-display text-display-xl">404</p>
        <p className="text-body-lg text-body">This page isn't part of your cockpit (yet).</p>
        <Button asChild>
          <Link to="/">Back to overview</Link>
        </Button>
      </div>
    </main>
  )
}
