import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { FlameIcon } from "lucide-react"

import { CheckButton } from "~/components/projects/check-button"
import { useHabitCheckin } from "~/hooks/use-habit-checkin"
import { formatDate } from "~/lib/finance"
import { describeHabit, describeStreak, habitProgress, type ProjectList } from "~/lib/projects"

/** Every habit from active projects, checkable in one place. */
export function TodayHabits({ data }: { data: ProjectList | undefined }) {
  const checkin = useHabitCheckin()

  if (!data) {
    return (
      <section className="grid gap-4 rounded-xl bg-canvas-soft p-6">
        <Skeleton className="h-8 w-40 bg-canvas" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 bg-canvas" />
        ))}
      </section>
    )
  }

  const { today } = data
  const rows = data.items
    .filter((p) => p.status === "active")
    .flatMap((project) =>
      project.habits.map((habit) => ({ project, habit, ...habitProgress(habit, today) })),
    )
  if (rows.length === 0) return null

  const done = rows.filter((r) => r.met).length

  return (
    <section className="grid gap-4 rounded-xl bg-canvas-soft p-6" aria-labelledby="today-title">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 id="today-title" className="text-display-xs">
            Today
          </h2>
          <span className="text-body-sm text-body">
            {formatDate(today, { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
        <p className="text-body-sm text-body tabular-nums">
          {done === rows.length ? "All done. Nice." : `${done} of ${rows.length} on track`}
        </p>
      </header>

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {rows.map(({ project, habit, doneToday, thisWeek, met }) => {
          const weekly = habit.cadence === "weekly"
          return (
            <li
              key={habit.id}
              className="flex items-center gap-4 rounded-lg bg-canvas py-3 pr-4 pl-3"
            >
              <CheckButton
                checked={doneToday}
                onClick={() => checkin.mutate({ habitId: habit.id, date: today, done: !doneToday })}
                aria-label={`${habit.name}: ${doneToday ? "done today" : "mark done today"}`}
              />
              <div className="grid min-w-0 flex-1">
                <span
                  className={cn(
                    "truncate text-body-md font-semibold",
                    met && !doneToday && "text-body",
                  )}
                >
                  {habit.name}
                </span>
                <span className="truncate text-body-sm text-body">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="underline-offset-2 hover:text-ink hover:underline"
                  >
                    {project.emoji} {project.name}
                  </Link>
                  {" · "}
                  {weekly
                    ? met
                      ? `Done for the week (${thisWeek}/${habit.target})`
                      : `${thisWeek} of ${habit.target} this week`
                    : describeHabit(habit)}
                </span>
              </div>
              {habit.streak > 0 ? (
                <span
                  className="flex shrink-0 items-center gap-1 text-body-sm font-semibold tabular-nums"
                  title={`${describeStreak(habit)} in a row`}
                >
                  <FlameIcon className="size-4 text-warning-deep" aria-hidden />
                  <span className="sr-only">Streak:</span>
                  {describeStreak(habit)}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
