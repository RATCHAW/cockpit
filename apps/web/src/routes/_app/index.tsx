import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { api } from "~/lib/api"
import { sessionQueryOptions } from "~/lib/session"

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Overview · Cockpit" }] }),
  component: OverviewPage,
})

function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 5) return "Up late"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function OverviewPage() {
  const { data: session } = useSuspenseQuery(sessionQueryOptions)
  const firstName = session?.user.name.split(" ")[0]

  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.health.$get()).json(),
  })

  return (
    <div className="mx-auto grid max-w-5xl gap-10">
      <header className="grid gap-3">
        <h1 className="font-display text-display-md sm:text-display-xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="text-body-lg text-body">Here's your cockpit. It's quiet for now.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="grid content-between gap-8 rounded-xl bg-canvas-soft p-6">
          <div className="grid gap-2">
            <h2 className="text-display-xs">Nothing here yet</h2>
            <p className="max-w-md text-body-md text-body">
              Finances, projects, boards and plans will show up here as each section gets built.
            </p>
          </div>
        </div>

        <div className="grid content-between gap-6 rounded-xl bg-ink p-6 text-canvas-soft">
          <h2 className="text-body-sm font-semibold text-canvas-soft/70">System</h2>
          <div className="grid gap-1">
            <p className="font-display text-display-md text-primary">
              {health.data?.status === "ok"
                ? "All good"
                : health.isPending
                  ? "Checking…"
                  : "Degraded"}
            </p>
            <p className="text-body-sm text-canvas-soft/70">
              API {health.isError ? "unreachable" : "online"} · database{" "}
              {health.data?.database ?? "…"}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
