import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cockpit/ui/components/alert-dialog"
import { Badge } from "@cockpit/ui/components/badge"
import { Button } from "@cockpit/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cockpit/ui/components/dropdown-menu"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { parseResponse } from "hono/client"
import {
  ArrowLeftIcon,
  CalendarIcon,
  CircleCheckIcon,
  EllipsisIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { TaskBoard } from "~/components/board/task-board"
import { TaskDialog, type TaskDialogState } from "~/components/board/task-dialog"
import { HabitDialog, type HabitDialogState } from "~/components/projects/habit-dialog"
import { HabitList } from "~/components/projects/habit-list"
import { ProjectDialog, type ProjectDialogState } from "~/components/projects/project-dialog"
import { api } from "~/lib/api"
import {
  formatShortDate,
  PROJECT_STATUS_LABELS,
  projectsKey,
  projectsQueryOptions,
  refreshProjectsAndTasks,
  relativeDays,
  tasksQueryOptions,
  type Project,
  type ProjectStatus,
} from "~/lib/projects"

export const Route = createFileRoute("/_app/projects/$projectId")({
  loader: async ({ context, params }) => {
    const [projects] = await Promise.all([
      context.queryClient.ensureQueryData(projectsQueryOptions()),
      context.queryClient.prefetchQuery(tasksQueryOptions),
    ])
    return { name: projects.items.find((p) => p.id === params.projectId)?.name }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Project not found"} · Cockpit` }],
  }),
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const projects = useQuery(projectsQueryOptions())
  const tasks = useQuery(tasksQueryOptions)

  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null)
  const [habitDialog, setHabitDialog] = useState<HabitDialogState | null>(null)
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null)

  const project = projects.data?.items.find((p) => p.id === projectId)
  const today = projects.data?.today

  if (!projects.data) {
    return (
      <div className="mx-auto grid max-w-6xl gap-8">
        <Skeleton className="h-28 rounded-xl bg-canvas-soft" />
        <Skeleton className="h-64 rounded-xl bg-canvas-soft" />
      </div>
    )
  }

  if (!project || !today) {
    return (
      <div className="mx-auto grid max-w-6xl justify-items-start gap-4">
        <h1 className="font-display text-display-md">Project not found</h1>
        <p className="text-body-md text-body">It may have been deleted.</p>
        <Button variant="outline" asChild>
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    )
  }

  const projectTasks = tasks.data?.items.filter((t) => t.projectId === project.id)

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10">
      <div className="grid gap-6">
        <Link
          to="/projects"
          className="flex w-fit items-center gap-2 text-body-sm font-semibold text-body hover:text-ink"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Projects
        </Link>
        <ProjectHeader
          project={project}
          today={today}
          onEdit={() => setProjectDialog({ mode: "edit", project })}
        />
      </div>

      <section className="grid gap-4" aria-labelledby="habits-title">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="habits-title" className="text-display-xs">
              Habits
            </h2>
            <p className="text-body-sm text-body">The regular things that move this forward.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setHabitDialog({ mode: "create", projectId: project.id, projectName: project.name })
            }
          >
            <PlusIcon />
            Add habit
          </Button>
        </header>
        {project.habits.length === 0 ? (
          <div className="grid justify-items-start gap-4 rounded-xl bg-canvas-soft p-6">
            <p className="max-w-lg text-body-md text-body">
              What would you do every day, or a few times a week, if you were serious about this?
              “Send one proposal”, “Go for a run”, “Study for 30 minutes”.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setHabitDialog({
                  mode: "create",
                  projectId: project.id,
                  projectName: project.name,
                })
              }
            >
              Add the first habit
            </Button>
          </div>
        ) : (
          <HabitList
            habits={project.habits}
            today={today}
            onEdit={(habit) => setHabitDialog({ mode: "edit", habit })}
          />
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="tasks-title">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="tasks-title" className="text-display-xs">
              Tasks
            </h2>
            <p className="text-body-sm text-body">
              One-off steps. They also show up on your{" "}
              <Link
                to="/board"
                search={{ project: project.id }}
                className="font-semibold text-ink underline underline-offset-2"
              >
                board
              </Link>
              .
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTaskDialog({ mode: "create", projectId: project.id })}
          >
            <PlusIcon />
            Add task
          </Button>
        </header>
        <TaskBoard
          tasks={projectTasks}
          projects={projects.data.items}
          showProject={false}
          newTaskProjectId={project.id}
          onOpen={(task) => setTaskDialog({ mode: "edit", task })}
        />
      </section>

      <ProjectDialog state={projectDialog} onClose={() => setProjectDialog(null)} />
      <HabitDialog state={habitDialog} onClose={() => setHabitDialog(null)} />
      <TaskDialog
        state={taskDialog}
        projects={projects.data.items}
        onClose={() => setTaskDialog(null)}
      />
    </div>
  )
}

function ProjectHeader({
  project,
  today,
  onEdit,
}: {
  project: Project
  today: string
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setStatus = useMutation({
    mutationFn: (status: ProjectStatus) =>
      parseResponse(api.projects[":id"].$patch({ param: { id: project.id }, json: { status } })),
    onSuccess: async (p) => {
      await queryClient.invalidateQueries({ queryKey: projectsKey })
      toast.success(
        { active: `${p.name} is active again`, paused: `${p.name} paused`, done: `${p.name} done` }[
          p.status
        ],
      )
    },
    onError: () => toast.error("Couldn't update the project. Try again."),
  })

  const remove = useMutation({
    mutationFn: () => parseResponse(api.projects[":id"].$delete({ param: { id: project.id } })),
    onSuccess: async () => {
      setConfirmDelete(false)
      await navigate({ to: "/projects" })
      await refreshProjectsAndTasks(queryClient)
      toast.success(`${project.name} deleted`)
    },
    onError: () => toast.error("Couldn't delete the project. Try again."),
  })

  const overdue = project.targetDate && project.targetDate < today && project.status !== "done"
  const taskCount = project.tasks.todo + project.tasks.doing + project.tasks.done

  return (
    <header className="flex flex-wrap items-start gap-6">
      <span
        className="grid size-20 shrink-0 place-items-center rounded-2xl bg-canvas-soft text-5xl"
        aria-hidden
      >
        {project.emoji}
      </span>
      <div className="grid min-w-0 flex-1 basis-80 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-display-md text-balance sm:text-display-xl">
            {project.name}
          </h1>
          {project.status !== "active" ? (
            <Badge variant={project.status === "done" ? "positive" : "default"}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          ) : null}
        </div>
        {project.description ? (
          <p className="max-w-2xl text-body-lg whitespace-pre-line text-body">
            {project.description}
          </p>
        ) : null}
        {project.targetDate ? (
          <p
            className={cn(
              "flex items-center gap-2 text-body-md font-semibold",
              overdue && "text-negative-darkest",
            )}
          >
            <CalendarIcon className="size-4" aria-hidden />
            {formatShortDate(project.targetDate, today)}
            <span className="font-normal text-body">
              · {relativeDays(project.targetDate, today)}
            </span>
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <PencilIcon />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-lg">
            {project.status === "active" ? (
              <>
                <DropdownMenuItem onSelect={() => setStatus.mutate("paused")}>
                  <PauseIcon />
                  Pause
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setStatus.mutate("done")}>
                  <CircleCheckIcon />
                  Mark as done
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => setStatus.mutate("active")}>
                {project.status === "paused" ? <PlayIcon /> : <RotateCcwIcon />}
                {project.status === "paused" ? "Resume" : "Reopen"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {[
                project.habits.length > 0 &&
                  `${project.habits.length} habit${project.habits.length === 1 ? "" : "s"} with their history`,
                taskCount > 0 && `${taskCount} task${taskCount === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" and ") || "Nothing else"}{" "}
              will be deleted with it. To keep the history, mark it as done instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                remove.mutate()
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
