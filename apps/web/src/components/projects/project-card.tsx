import { Badge } from "@cockpit/ui/components/badge"
import { cn } from "@cockpit/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { CalendarIcon, FlameIcon } from "lucide-react"

import {
  addDays,
  describeStreak,
  formatShortDate,
  PROJECT_STATUS_LABELS,
  relativeDays,
  type Project,
} from "~/lib/projects"

export function ProjectCard({ project, today }: { project: Project; today: string }) {
  const { todo, doing, done } = project.tasks
  const total = todo + doing + done
  const inactive = project.status !== "active"
  const overdue = project.targetDate && project.targetDate < today && project.status !== "done"

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className={cn(
        "group grid grid-cols-[minmax(0,1fr)] content-start gap-5 rounded-xl bg-canvas-soft p-6 transition-[background-color,box-shadow] duration-150 ease-out",
        "hover:bg-wise-green-pale/40 focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid size-12 place-items-center rounded-full bg-canvas text-2xl",
            inactive && "grayscale",
          )}
          aria-hidden
        >
          {project.emoji}
        </span>
        {inactive ? (
          <Badge variant={project.status === "done" ? "positive" : "default"} className="bg-canvas">
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-1">
        <h3 className="text-display-xs text-balance">{project.name}</h3>
        {project.description ? (
          <p className="line-clamp-2 text-body-sm text-body">{project.description}</p>
        ) : null}
      </div>

      {project.targetDate ? (
        <p
          className={cn(
            "flex items-center gap-2 text-body-sm font-semibold",
            overdue ? "text-negative-darkest" : "text-ink",
          )}
        >
          <CalendarIcon className="size-4 shrink-0" aria-hidden />
          {formatShortDate(project.targetDate, today)}
          <span className="font-normal text-body">· {relativeDays(project.targetDate, today)}</span>
        </p>
      ) : null}

      {project.habits.length > 0 ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" aria-label="Habits">
          {project.habits.map((habit) => (
            <li key={habit.id} className="flex items-center gap-3">
              <WeekDots checkins={habit.checkins} today={today} />
              <span className="min-w-0 flex-1 truncate text-body-sm">{habit.name}</span>
              {habit.streak > 0 ? (
                <span
                  className="flex shrink-0 items-center gap-1 text-caption font-semibold text-body tabular-nums"
                  title={`${describeStreak(habit)} in a row`}
                >
                  <FlameIcon className="size-3.5 text-warning-deep" aria-hidden />
                  {habit.streak}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2 text-body-sm text-body">
          <span>
            {total === 0
              ? "No tasks yet"
              : todo + doing === 0
                ? "All tasks done"
                : [todo && `${todo} to do`, doing && `${doing} doing`].filter(Boolean).join(" · ")}
          </span>
          {total > 0 ? (
            <span className="tabular-nums">
              {done}/{total}
            </span>
          ) : null}
        </div>
        {total > 0 ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-ink"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        ) : null}
      </div>
    </Link>
  )
}

/** The last seven days, oldest first, filled where the habit was done. */
function WeekDots({ checkins, today }: { checkins: string[]; today: string }) {
  const done = new Set(checkins)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const count = days.filter((d) => done.has(d)).length
  return (
    <span
      className="flex shrink-0 gap-1"
      role="img"
      aria-label={`Done ${count} of the last 7 days`}
    >
      {days.map((day) => (
        <span
          key={day}
          className={cn(
            "size-2 rounded-full",
            done.has(day) ? "bg-ink" : "bg-canvas",
            day === today && !done.has(day) && "ring-1 ring-mute ring-inset",
          )}
        />
      ))}
    </span>
  )
}
