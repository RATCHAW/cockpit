import { createFileRoute } from "@tanstack/react-router"

import { FocusReport, TodayFocus } from "~/components/pomodoro/focus-analytics"
import { FocusTimer } from "~/components/pomodoro/focus-timer"
import { timerQueryOptions } from "~/lib/pomodoro"
import { projectsQueryOptions, tasksQueryOptions } from "~/lib/projects"

export const Route = createFileRoute("/_app/pomodoro")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(timerQueryOptions),
      context.queryClient.prefetchQuery(tasksQueryOptions),
      context.queryClient.prefetchQuery(projectsQueryOptions()),
    ]),
  head: () => ({ meta: [{ title: "Pomodoro · Cockpit" }] }),
  component: PomodoroPage,
})

function PomodoroPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="grid gap-3">
        <h1 className="font-display text-display-md sm:text-display-xl">Make room for focus.</h1>
        <p className="text-body-md text-body">
          One task, one session. Build a rhythm you can look back on.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FocusTimer />
        <TodayFocus />
      </div>
      <FocusReport />
    </div>
  )
}
