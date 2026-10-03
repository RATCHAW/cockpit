import { Button } from "@cockpit/ui/components/button"
import { cn } from "@cockpit/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { z } from "zod"

import { TaskBoard } from "~/components/board/task-board"
import { TaskDialog, type TaskDialogState } from "~/components/board/task-dialog"
import { projectsQueryOptions, tasksQueryOptions, type Task } from "~/lib/projects"

/** `none` is the board for standalone tasks; a project id narrows to that project. */
const searchSchema = z.object({
  project: z
    .union([z.literal("none"), z.uuid()])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute("/_app/board")({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(projectsQueryOptions()),
      context.queryClient.prefetchQuery(tasksQueryOptions),
    ]),
  head: () => ({ meta: [{ title: "Board · Cockpit" }] }),
  component: BoardPage,
})

function BoardPage() {
  const { project: filter } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [dialog, setDialog] = useState<TaskDialogState | null>(null)

  const projects = useQuery(projectsQueryOptions())
  const tasks = useQuery(tasksQueryOptions)
  const allProjects = projects.data?.items ?? []

  const matches = (task: Task) =>
    filter === undefined ||
    (filter === "none" ? task.projectId === null : task.projectId === filter)
  const visible = tasks.data?.items.filter(matches)
  const newTaskProjectId = filter === undefined || filter === "none" ? null : filter

  // Paused and done projects only get a chip while they still have open tasks.
  const openCount = (projectId: string | null) =>
    tasks.data?.items.filter((t) => t.projectId === projectId && t.status !== "done").length ?? 0
  const chips = allProjects.filter(
    (p) => p.status === "active" || openCount(p.id) > 0 || p.id === filter,
  )

  const setFilter = (project: typeof filter) =>
    void navigate({ search: { project }, replace: true })

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <h1 className="font-display text-display-md sm:text-display-xl">Board</h1>
          <p className="text-body-md text-body">
            Everything you need to get done, for a project or not.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create", projectId: newTaskProjectId })}>
          <PlusIcon />
          Add task
        </Button>
      </header>

      <nav aria-label="Filter by project" className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
          <FilterChip active={filter === undefined} onClick={() => setFilter(undefined)}>
            Everything
          </FilterChip>
          <FilterChip
            active={filter === "none"}
            onClick={() => setFilter("none")}
            count={openCount(null)}
          >
            No project
          </FilterChip>
          {chips.map((p) => (
            <FilterChip
              key={p.id}
              active={filter === p.id}
              onClick={() => setFilter(p.id)}
              count={openCount(p.id)}
            >
              <span aria-hidden>{p.emoji}</span> {p.name}
            </FilterChip>
          ))}
        </ul>
      </nav>

      {tasks.isError || projects.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-negative-bg p-4 text-body-sm font-semibold text-white"
        >
          Couldn't load your board. Try again in a moment.
        </p>
      ) : null}

      <TaskBoard
        tasks={visible}
        projects={allProjects}
        showProject={filter === undefined}
        newTaskProjectId={newTaskProjectId}
        onOpen={(task) => setDialog({ mode: "edit", task })}
      />

      <TaskDialog state={dialog} projects={allProjects} onClose={() => setDialog(null)} />
    </div>
  )
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count?: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full px-4 text-body-sm font-semibold whitespace-nowrap transition-colors duration-150 ease-out",
          "focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none",
          active ? "bg-ink text-canvas" : "bg-canvas-soft text-ink hover:bg-wise-green-pale/60",
        )}
      >
        <span>{children}</span>
        {count ? (
          <span className={cn("tabular-nums", active ? "text-canvas/70" : "text-mute")}>
            {count}
          </span>
        ) : null}
      </button>
    </li>
  )
}
