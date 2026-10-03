import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@cockpit/ui/components/button"
import { Input } from "@cockpit/ui/components/input"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { AlignLeftIcon, CalendarIcon, PlusIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState, type ComponentProps } from "react"
import { toast } from "sonner"

import { CheckButton } from "~/components/projects/check-button"
import { api } from "~/lib/api"
import {
  formatShortDate,
  localToday,
  refreshProjectsAndTasks,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  tasksKey,
  type Project,
  type Task,
  type TaskStatus,
} from "~/lib/projects"

type Columns = Record<TaskStatus, Task[]>
type TaskList = { items: Task[] }

/** Done piles up; older cards stay out of the way until asked for. */
const DONE_VISIBLE = 12

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
const dropAnimation: DropAnimation = { duration: 200, easing: EASE_OUT }

function group(tasks: Task[]): Columns {
  const columns: Columns = { todo: [], doing: [], done: [] }
  for (const task of tasks) columns[task.status].push(task)
  for (const status of TASK_STATUSES) columns[status].sort((a, b) => a.position - b.position)
  return columns
}

const isStatus = (id: UniqueIdentifier): id is TaskStatus =>
  (TASK_STATUSES as readonly UniqueIdentifier[]).includes(id)

function columnOf(columns: Columns, id: UniqueIdentifier): TaskStatus | undefined {
  if (isStatus(id)) return id
  return TASK_STATUSES.find((status) => columns[status].some((t) => t.id === id))
}

/** A position between the card's new neighbours, so nothing else has to move. */
function positionBetween(prev: Task | undefined, next: Task | undefined) {
  if (prev && next) return (prev.position + next.position) / 2
  if (prev) return prev.position + 1
  if (next) return next.position - 1
  return 0
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function TaskBoard({
  tasks,
  projects,
  showProject = true,
  newTaskProjectId = null,
  onOpen,
}: {
  /** Already filtered to what this board shows. */
  tasks: Task[] | undefined
  projects: Project[]
  /** Show which project each card belongs to. Off when the board is a single project's. */
  showProject?: boolean
  /** Project that quick-added tasks belong to. */
  newTaskProjectId?: string | null
  onOpen: (task: Task) => void
}) {
  const queryClient = useQueryClient()
  const columns = useMemo(() => group(tasks ?? []), [tasks])
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  // While dragging, cards move between columns in local state; the cache updates on drop.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const shown = dragColumns ?? columns

  /**
   * Find the column under the pointer, then the closest card in it. Columns are droppable
   * themselves (so empty ones accept cards), which would otherwise swallow every drop.
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerHits = pointerWithin(args)
      const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args)
      const overId = getFirstCollision(hits, "id")
      if (overId === null || !isStatus(overId)) return hits
      const ids = new Set<UniqueIdentifier>(shown[overId].map((t) => t.id))
      if (ids.size === 0) return hits
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => ids.has(c.id)),
      })
    },
    [shown],
  )

  const sensors = useSensors(
    // A small threshold keeps plain clicks opening the card.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch so the page can still scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter opens a card; Space picks it up.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  )

  const move = useMutation({
    mutationFn: (vars: { id: string; status: TaskStatus; position?: number }) =>
      parseResponse(
        api.tasks[":id"].$patch({
          param: { id: vars.id },
          json: { status: vars.status, position: vars.position },
        }),
      ),
    onError: () => {
      toast.error("Couldn't move that task. Try again.")
    },
    onSettled: () => refreshProjectsAndTasks(queryClient),
  })

  /** Applies a move to the cache right away — before the request, so the drop doesn't flicker. */
  function moveTask(id: string, status: TaskStatus, position: number) {
    void queryClient.cancelQueries({ queryKey: tasksKey })
    queryClient.setQueryData<TaskList>(tasksKey, (data) =>
      data
        ? {
            items: data.items.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    position,
                    completedAt:
                      status === "done" ? (t.completedAt ?? new Date().toISOString()) : null,
                  }
                : t,
            ),
          }
        : data,
    )
    move.mutate({ id, status, position })
  }

  function toggleDone(task: Task) {
    const status: TaskStatus = task.status === "done" ? "todo" : "done"
    moveTask(task.id, status, positionBetween(undefined, columns[status][0]))
  }

  function onDragStart({ active }: DragStartEvent) {
    setDragColumns(columns)
    setActiveTask((tasks ?? []).find((t) => t.id === active.id) ?? null)
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    setDragColumns((current) => {
      if (!current) return current
      const from = columnOf(current, active.id)
      const to = columnOf(current, over.id)
      if (!from || !to || from === to) return current
      const task = current[from].find((t) => t.id === active.id)!
      const target = current[to]
      const overIndex = target.findIndex((t) => t.id === over.id)
      const index = overIndex === -1 ? target.length : overIndex
      return {
        ...current,
        [from]: current[from].filter((t) => t.id !== active.id),
        [to]: [...target.slice(0, index), task, ...target.slice(index)],
      }
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = dragColumns
    const original = activeTask
    setDragColumns(null)
    setActiveTask(null)
    if (!over || !current || !original) return

    const status = columnOf(current, active.id)
    if (!status) return
    let list = current[status]
    const from = list.findIndex((t) => t.id === active.id)
    const overIndex = list.findIndex((t) => t.id === over.id)
    if (overIndex !== -1 && overIndex !== from) list = arrayMove(list, from, overIndex)

    const index = list.findIndex((t) => t.id === active.id)
    const before = columns[original.status].map((t) => t.id)
    const after = list.map((t) => t.id)
    const unchanged =
      status === original.status && before.indexOf(original.id) === after.indexOf(original.id)
    if (unchanged) return

    moveTask(original.id, status, positionBetween(list[index - 1], list[index + 1]))
  }

  const titleOf = (id: UniqueIdentifier) => (tasks ?? []).find((t) => t.id === id)?.title ?? "Task"
  const placeOf = (id: UniqueIdentifier) => {
    const source = dragColumns ?? columns
    const status = columnOf(source, id)
    if (!status) return ""
    const index = source[status].findIndex((t) => t.id === id)
    return `${TASK_STATUS_LABELS[status]}, position ${index + 1} of ${source[status].length}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(active.id)} is over ${placeOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped ${titleOf(active.id)} in ${placeOf(active.id)}.` : "Dropped.",
    onDragCancel: ({ active }) => `Cancelled. ${titleOf(active.id)} is back where it was.`,
  }

  if (!tasks) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {TASK_STATUSES.map((s) => (
          <Skeleton key={s} className="h-72 rounded-xl bg-canvas-soft" />
        ))}
      </div>
    )
  }

  const today = localToday()
  const card = (task: Task, dragProps?: DragProps) => (
    <TaskCard
      task={task}
      dragProps={dragProps}
      project={showProject && task.projectId ? projectsById.get(task.projectId) : undefined}
      today={today}
      onOpen={() => onOpen(task)}
      onToggleDone={() => toggleDone(task)}
    />
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragColumns(null)
        setActiveTask(null)
      }}
      accessibility={{ announcements }}
    >
      <div className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
        {TASK_STATUSES.map((status) => {
          const all = shown[status]
          const limit = status === "done" && !showAllDone ? DONE_VISIBLE : Infinity
          const visible = all.slice(0, limit)
          return (
            <Column key={status} status={status} count={all.length}>
              {status === "todo" ? <QuickAdd projectId={newTaskProjectId} /> : null}
              <SortableContext
                items={visible.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
                  {visible.map((task) => (
                    <SortableTask key={task.id} id={task.id}>
                      {(dragProps) => card(task, dragProps)}
                    </SortableTask>
                  ))}
                  {all.length === 0 ? <EmptyColumn status={status} /> : null}
                </ul>
              </SortableContext>
              {all.length > visible.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-center"
                  onClick={() => setShowAllDone(true)}
                >
                  Show {all.length - visible.length} older
                </Button>
              ) : null}
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={prefersReducedMotion() ? null : dropAnimation}>
        {activeTask ? (
          <div className="cursor-grabbing rounded-lg shadow-xl shadow-ink/10 motion-safe:scale-[1.02]">
            {card(activeTask)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  count,
  children,
}: {
  status: TaskStatus
  count: number
  children: React.ReactNode
}) {
  // Lets cards drop into an empty column, or below the last card.
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-${status}`}
      className={cn(
        "grid w-[85%] shrink-0 snap-start grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-xl bg-canvas-soft p-3 transition-[box-shadow] duration-150 ease-out md:w-auto",
        isOver && "ring-2 ring-ink/10",
      )}
    >
      <header className="flex items-center gap-2 px-2 pt-1">
        <h2 id={`column-${status}`} className="text-body-md font-semibold">
          {TASK_STATUS_LABELS[status]}
        </h2>
        <span className="text-body-sm text-mute tabular-nums">{count}</span>
      </header>
      {children}
    </section>
  )
}

function EmptyColumn({ status }: { status: TaskStatus }) {
  const copy = {
    todo: "Nothing to do. Add something above.",
    doing: "Drag a task here when you start it.",
    done: "Finished tasks land here.",
  }[status]
  return (
    <li className="grid min-h-16 place-items-center rounded-lg border-[1.5px] border-dashed border-mute/40 px-4 text-center text-body-sm text-mute">
      {copy}
    </li>
  )
}

type Sortable = ReturnType<typeof useSortable>
type DragProps = Pick<Sortable, "attributes" | "listeners" | "isDragging">

function SortableTask({
  id,
  children,
}: {
  id: string
  children: (dragProps: DragProps) => React.ReactNode
}) {
  const reduce = prefersReducedMotion()
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: reduce ? null : { duration: 200, easing: EASE_OUT },
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-40")}
    >
      {children({ attributes, listeners, isDragging })}
    </li>
  )
}

function TaskCard({
  task,
  project,
  today,
  dragProps,
  onOpen,
  onToggleDone,
}: {
  task: Task
  project: Project | undefined
  today: string
  /** Absent on the copy that follows the pointer while dragging. */
  dragProps?: DragProps
  onOpen: () => void
  onToggleDone: () => void
}) {
  const done = task.status === "done"
  const overdue = !done && task.dueDate !== null && task.dueDate < today
  const dueToday = !done && task.dueDate === today
  const { onKeyDown: dragKeyDown, ...dragListeners } = dragProps?.listeners ?? {}

  return (
    <div
      role="button"
      tabIndex={0}
      {...dragProps?.attributes}
      {...dragListeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        ;(dragKeyDown as ((e: React.KeyboardEvent) => void) | undefined)?.(e)
        // Enter also drops a card mid-drag; only open it when it's sitting still.
        if (e.key === "Enter" && e.target === e.currentTarget && !dragProps?.isDragging) onOpen()
      }}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg bg-canvas p-3 text-left transition-shadow duration-150 ease-out select-none",
        "hover:shadow-[0_0_0_1px_var(--color-border)] focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none",
      )}
    >
      <CheckButton
        size="sm"
        checked={done}
        onClick={(e) => {
          e.stopPropagation()
          onToggleDone()
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        className="mt-px"
      />
      <div className="grid min-w-0 flex-1 gap-2 pt-1">
        <p
          className={cn(
            "line-clamp-3 text-body-sm font-semibold break-words",
            done && "text-body line-through decoration-mute",
          )}
        >
          {task.title}
        </p>
        {project || task.dueDate || task.notes ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {project ? (
              <Chip title={project.name}>
                <span aria-hidden>{project.emoji}</span>
                <span className="truncate">{project.name}</span>
              </Chip>
            ) : null}
            {task.dueDate ? (
              <Chip
                className={cn(
                  overdue && "bg-negative-bg text-white",
                  dueToday && "bg-warning text-warning-content",
                )}
              >
                <CalendarIcon aria-hidden />
                {dueToday ? "Today" : formatShortDate(task.dueDate, today)}
                {overdue ? <span className="sr-only">(overdue)</span> : null}
              </Chip>
            ) : null}
            {task.notes ? (
              <AlignLeftIcon className="size-3.5 text-mute" aria-label="Has notes" />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Chip({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full bg-canvas-soft px-2 py-0.5 text-caption font-semibold text-ink [&>svg]:size-3 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function QuickAdd({ projectId }: { projectId: string | null }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const add = useMutation({
    mutationFn: (title: string) =>
      parseResponse(api.tasks.$post({ json: { title, projectId, status: "todo" } })),
    onSuccess: async () => {
      setTitle("")
      await refreshProjectsAndTasks(queryClient)
      inputRef.current?.focus()
    },
    onError: () => toast.error("Couldn't add that task. Try again."),
  })

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        const value = title.trim()
        if (value && !add.isPending) add.mutate(value)
      }}
    >
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        aria-label="New task"
        maxLength={200}
        className="h-11 border-transparent pr-11 shadow-none focus-visible:border-ink"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1.5 -translate-y-1/2"
        disabled={!title.trim() || add.isPending}
        aria-label="Add task"
      >
        <PlusIcon />
      </Button>
    </form>
  )
}
