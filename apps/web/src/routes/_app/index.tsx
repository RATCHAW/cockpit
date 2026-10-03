import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { TaskDialog, type TaskDialogState } from "~/components/board/task-dialog"
import { Deadlines } from "~/components/overview/deadlines"
import { MonthMoney, UpcomingBills } from "~/components/overview/money"
import { UpNext } from "~/components/overview/up-next"
import { TodayHabits } from "~/components/projects/today-habits"
import {
  formatDate,
  periodRange,
  recurringQueryOptions,
  settingsQueryOptions,
  summaryQueryOptions,
} from "~/lib/finance"
import {
  habitProgress,
  localToday,
  projectsQueryOptions,
  tasksQueryOptions,
  type ProjectList,
  type Task,
} from "~/lib/projects"
import { sessionQueryOptions } from "~/lib/session"

export const Route = createFileRoute("/_app/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(projectsQueryOptions()),
      context.queryClient.prefetchQuery(tasksQueryOptions),
      context.queryClient.prefetchQuery(settingsQueryOptions),
    ]),
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "2 habits to go, 1 task overdue." Or a quiet line when nothing needs you today. */
function todayLine(projects: ProjectList, tasks: Task[], today: string) {
  const habitsLeft = projects.items
    .filter((p) => p.status === "active")
    .flatMap((p) => p.habits)
    .filter((h) => !habitProgress(h, today).met).length
  const open = tasks.filter((t) => t.status !== "done" && t.dueDate !== null)
  const overdue = open.filter((t) => t.dueDate! < today).length
  const dueToday = open.filter((t) => t.dueDate === today).length

  const parts = [
    habitsLeft > 0 && `${plural(habitsLeft, "habit", "habits")} to go`,
    overdue > 0 && `${plural(overdue, "task", "tasks")} overdue`,
    dueToday > 0 && `${plural(dueToday, "task", "tasks")} due today`,
  ].filter(Boolean)
  return parts.length > 0 ? `${parts.join(", ")}.` : "Nothing pressing. Enjoy it."
}

function OverviewPage() {
  const { data: session } = useSuspenseQuery(sessionQueryOptions)
  const firstName = session?.user.name.split(" ")[0]
  const [dialog, setDialog] = useState<TaskDialogState | null>(null)

  const today = localToday()
  const projects = useQuery(projectsQueryOptions(today))
  const tasks = useQuery(tasksQueryOptions)
  const allProjects = projects.data?.items ?? []

  const settings = useQuery(settingsQueryOptions)
  const currency = settings.data?.displayCurrency
  // Same range and key as the Finances page's "This month", so the two share a cache entry.
  const month = { ...periodRange("month"), currency }
  const summary = useQuery({ ...summaryQueryOptions(month), enabled: !!currency })
  const recurring = useQuery({ ...recurringQueryOptions(currency), enabled: !!currency })

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="grid gap-3">
        <h1 className="font-display text-display-md sm:text-display-xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="min-h-[1.875rem] text-body-lg text-body">
          {formatDate(today, { weekday: "long", month: "long", day: "numeric" })}
          {projects.data && tasks.data ? (
            <>
              {" · "}
              <span className="text-ink">{todayLine(projects.data, tasks.data.items, today)}</span>
            </>
          ) : null}
        </p>
      </header>

      {projects.isError || tasks.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-negative-bg p-4 text-body-sm font-semibold text-white"
        >
          Couldn't load your projects and tasks. Try again in a moment.
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <TodayHabits data={projects.data} />
          <UpNext
            tasks={tasks.data?.items}
            projects={allProjects}
            today={today}
            onOpen={(task) => setDialog({ mode: "edit", task })}
            onAdd={() => setDialog({ mode: "create" })}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <MonthMoney summary={summary.data} failed={summary.isError} today={today} />
          <UpcomingBills data={recurring.data} today={today} />
          <Deadlines projects={allProjects} today={today} />
        </div>
      </div>

      <TaskDialog state={dialog} projects={allProjects} onClose={() => setDialog(null)} />
    </div>
  )
}
