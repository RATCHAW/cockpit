import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { Logo } from "~/components/logo"
import { sessionQueryOptions } from "~/lib/session"

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (session) throw redirect({ to: "/" })
  },
  component: AuthLayout,
})

const sections = ["Finances", "Projects", "Boards", "Goals", "Ideas"]

function AuthLayout() {
  return (
    <div className="grid min-h-dvh gap-4 bg-background p-3 sm:p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between rounded-xl bg-ink p-10 lg:flex xl:p-12">
        <Logo tone="light" />
        <div className="grid gap-8">
          <h1 className="font-display text-display-xl text-primary 2xl:text-display-xxl">
            Everything you run.
            <br />
            One cockpit.
          </h1>
          <ul className="flex max-w-md flex-wrap gap-2" aria-label="What lives in Cockpit">
            {sections.map((section) => (
              <li
                key={section}
                className="rounded-full border border-primary/30 px-3 py-1 text-body-sm font-semibold text-primary"
              >
                {section}
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-sm text-body-sm text-canvas-soft/60">
          Your finances, projects and plans — the whole picture, on one screen.
        </p>
      </aside>

      <main className="flex flex-col items-center justify-center px-1 py-8 sm:py-12">
        <Logo className="mb-8 lg:hidden" />
        <div className="w-full max-w-[420px] animate-in duration-300 ease-out fade-in motion-safe:slide-in-from-bottom-2">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
