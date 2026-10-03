import { Button } from "@cockpit/ui/components/button"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { CalendarIcon, PlusIcon } from "lucide-react"

import { Chip } from "~/components/board/task-board"
import { CardHeader } from "~/components/overview/card-header"
import { CheckButton } from "~/components/projects/check-button"
import { topOf, useMoveTask } from "~/hooks/use-move-task"
import { isoDate } from "~/lib/finance"
import { addDays, formatShortDate, type Project, type Task } from "~/lib/projects"

/** How far ahead a due date counts as "coming up". */
const SOON_DAYS = 7
const MAX_ROWS = 7

type Reason = "overdue" | "today" | "doing" | "soon" | "done"
const ORDER: Record<Reason, number> = { overdue: 0, today: 1, doing: 2, soon: 3, done: 4 }

/** Why a task belongs on the overview, or null when it can wait on the board. */
function reasonFor(task: Task, today: string): Reason | null {
  if (task.status === "done") {
    // Ticked off today: stays in view so the progress shows and a mis-tap can be undone.
    return task.completedAt && isoDate(new Date(task.completedAt)) === today ? "done" : null
  }
  if (task.dueDate && task.dueDate < today) return "overdue"
  if (task.dueDate === today) return "today"
  if (task.status === "doing") return "doing"
  if (task.dueDate && task.dueDate <= addDays(today, SOON_DAYS)) return "soon"
  return null
}

/** Overdue, due today, in progress and due this week. */
export function UpNext({
  tasks,
  projects,
  today,
  onOpen,
  onAdd,
}: {
  tasks: Task[] | undefined
  projects: Project[]
  today: string
  onOpen: (task: Task) => void
  onAdd: () => void
}) {
  const moveTask = useMoveTask()

  if (!tasks) {
    return (
      <section className="grid gap-4 rounded-xl bg-canvas-soft p-6">
        <Skeleton className="h-8 w-40 bg-canvas" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 bg-canvas" />
        ))}
      </section>
    )
  }

  const projectsById = new Map(projects.map((p) => [p.id, p]))
  const rows = tasks
    .flatMap((task) => {
      const reason = reasonFor(task, today)
      return reason ? [{ task, reason }] : []
    })
    .sort(
      (a, b) =>
        ORDER[a.reason] - ORDER[b.reason] ||
        (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999") ||
        a.task.position - b.task.position,
    )
  const shown = rows.slice(0, MAX_ROWS)
  const open = tasks.filter((t) => t.status !== "done").length
  const pressing = rows.filter((r) => r.reason !== "done").length
  const waiting = open - pressing

  return (
    <section className="grid gap-4 rounded-xl bg-canvas-soft p-6" aria-labelledby="up-next-title">
      <CardHeader
        id="up-next-title"
        title="Up next"
        caption={
          open === 0
            ? undefined
            : waiting > 0
              ? `${waiting} more ${waiting === 1 ? "task" : "tasks"} waiting on the board`
              : "That's everything on the board"
        }
        to="/board"
        linkLabel="Open the board"
      />

      {shown.length === 0 ? (
        <div className="grid justify-items-start gap-4 rounded-lg bg-canvas p-4">
          <p className="text-body-sm text-body">
            {open === 0
              ? "Nothing on your plate. Add the next thing you need to do."
              : `Nothing due this week. Pick something from the board when you're ready.`}
          </p>
          {open === 0 ? (
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <PlusIcon />
              Add a task
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {shown.map(({ task, reason }) => {
            const project = task.projectId ? projectsById.get(task.projectId) : undefined
            const done = reason === "done"
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-lg bg-canvas py-2 pr-3 pl-2"
              >
                <CheckButton
                  size="sm"
                  checked={done}
                  onClick={() => {
                    const status = done ? "todo" : "done"
                    moveTask(task.id, status, topOf(tasks, status))
                  }}
                  aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
                />
                <button
                  type="button"
                  onClick={() => onOpen(task)}
                  className="grid min-w-0 flex-1 gap-1 rounded-md py-1 text-left focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "truncate text-body-sm font-semibold",
                      done && "text-body line-through decoration-mute",
                    )}
                  >
                    {task.title}
                  </span>
                  {project || reason !== "done" ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <ReasonChip task={task} reason={reason} today={today} />
                      {project ? (
                        <Chip title={project.name}>
                          <span aria-hidden>{project.emoji}</span>
                          <span className="truncate">{project.name}</span>
                        </Chip>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {rows.length > shown.length ? (
        <p className="text-body-sm text-body">And {rows.length - shown.length} more due soon.</p>
      ) : null}
    </section>
  )
}

function ReasonChip({ task, reason, today }: { task: Task; reason: Reason; today: string }) {
  switch (reason) {
    case "overdue":
      return (
        <Chip className="bg-negative-bg text-white">
          <CalendarIcon aria-hidden />
          {formatShortDate(task.dueDate!, today)}
          <span className="sr-only">(overdue)</span>
        </Chip>
      )
    case "today":
      return (
        <Chip className="bg-warning text-warning-content">
          <CalendarIcon aria-hidden />
          Today
        </Chip>
      )
    case "soon":
      return (
        <Chip>
          <CalendarIcon aria-hidden />
          {task.dueDate === addDays(today, 1) ? "Tomorrow" : formatShortDate(task.dueDate!, today)}
        </Chip>
      )
    case "doing":
      return <Chip className="bg-wise-green-pale text-ink-deep">In progress</Chip>
    case "done":
      return null
  }
}
