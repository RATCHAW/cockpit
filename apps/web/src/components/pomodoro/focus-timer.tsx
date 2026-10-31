import { Button } from "@cockpit/ui/components/button"
import { Input } from "@cockpit/ui/components/input"
import { Label } from "@cockpit/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cockpit/ui/components/select"
import { cn } from "@cockpit/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import {
  CoffeeIcon,
  PauseIcon,
  PlayIcon,
  Settings2Icon,
  SquareIcon,
  TargetIcon,
} from "lucide-react"
import { useState } from "react"

import { usePomodoro } from "~/hooks/use-pomodoro"
import {
  clockLabel,
  nextKind,
  plannedSeconds,
  POMODORO_LABELS,
  type PomodoroKind,
} from "~/lib/pomodoro"
import { projectsQueryOptions, tasksQueryOptions } from "~/lib/projects"

import { PomodoroSettingsDialog } from "./settings-dialog"

const kinds: PomodoroKind[] = ["focus", "short_break", "long_break"]

export function FocusTimer() {
  const timer = usePomodoro()
  const { query, current, remaining, act, pending } = timer
  const [selection, setSelection] = useState<{ kind: PomodoroKind; after: string | null } | null>(
    null,
  )
  const [taskId, setTaskId] = useState("none")
  const [projectId, setProjectId] = useState("none")
  const [title, setTitle] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const tasks = useQuery(tasksQueryOptions)
  const projects = useQuery(projectsQueryOptions())
  const state = query.data

  if (!state)
    return (
      <section
        className="grid min-h-96 place-items-center rounded-xl bg-canvas-soft p-6"
        aria-busy={!query.isError}
      >
        {query.isError ? (
          <div role="alert" className="grid gap-4 text-center">
            <p>Couldn't load your timer.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-body">Loading your timer…</p>
        )}
      </section>
    )

  const lastId = state.lastSession?.id ?? null
  const kind =
    current?.kind ??
    (selection?.after === lastId
      ? selection.kind
      : nextKind(state.lastSession, state.completedFocusCount, state.settings.longBreakEvery))
  const seconds = current ? remaining : plannedSeconds(kind, state.settings)
  const total = current?.plannedSeconds ?? plannedSeconds(kind, state.settings)
  const progress = Math.min(100, Math.max(0, 100 * (1 - seconds / total)))
  const cycle = state.completedFocusCount % state.settings.longBreakEvery
  const activeTask = tasks.data?.items.find((task) => task.id === taskId)

  return (
    <section
      className="grid gap-6 rounded-xl bg-canvas-soft p-5 sm:p-8"
      aria-label="Pomodoro timer"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-body-sm font-semibold">
          <span
            className={cn(
              "size-2 rounded-full",
              current?.status === "running" ? "bg-positive" : "bg-mute",
            )}
            aria-hidden
          />
          {current?.status === "running"
            ? "In progress"
            : current?.status === "paused"
              ? "Paused"
              : "One thing at a time"}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Timer settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2Icon />
        </Button>
      </div>
      <div className="flex flex-wrap justify-center gap-2" aria-label="Timer mode">
        {kinds.map((value) => (
          <Button
            key={value}
            variant={kind === value ? "dark" : "ghost"}
            size="sm"
            aria-pressed={kind === value}
            disabled={!!current || pending}
            onClick={() => setSelection({ kind: value, after: lastId })}
          >
            {POMODORO_LABELS[value]}
          </Button>
        ))}
      </div>
      <div className="grid justify-items-center gap-6 py-4 sm:py-6">
        {kind === "focus" ? (
          <TargetIcon className="size-6 text-body" aria-hidden />
        ) : (
          <CoffeeIcon className="size-6 text-body" aria-hidden />
        )}
        <p
          role="timer"
          aria-label={`${POMODORO_LABELS[kind]} time remaining`}
          aria-live="off"
          className="font-display text-[clamp(4rem,12vw,7.5rem)] leading-none font-extrabold tracking-tighter tabular-nums"
        >
          {clockLabel(seconds)}
        </p>
        <p className="text-center text-body-sm text-body">
          {kind === "focus"
            ? "Give this moment your full attention."
            : "Step away. Stretch. Come back fresh."}
        </p>
        <div
          role="progressbar"
          aria-label="Interval progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(progress)}
          className="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-ink/10"
        >
          <div className="h-full rounded-full bg-ink" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {current ? (
            <>
              <Button
                size="lg"
                disabled={pending || seconds === 0}
                onClick={() =>
                  act({ action: current.status === "running" ? "pause" : "resume", id: current.id })
                }
              >
                {current.status === "running" ? <PauseIcon /> : <PlayIcon />}
                {pending
                  ? "Updating…"
                  : seconds === 0
                    ? "Finishing…"
                    : current.status === "running"
                      ? "Pause"
                      : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={pending || seconds === 0}
                onClick={() => act({ action: "stop", id: current.id })}
              >
                <SquareIcon />
                End early
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              className="min-w-48"
              disabled={pending || query.isError}
              onClick={() =>
                act({
                  action: "start",
                  id: crypto.randomUUID(),
                  kind,
                  taskId: taskId === "none" ? null : taskId,
                  projectId: projectId === "none" ? null : projectId,
                  title,
                })
              }
            >
              <PlayIcon />
              {pending ? "Starting…" : `Start ${kind === "focus" ? "focus" : "break"}`}
            </Button>
          )}
        </div>
      </div>
      {query.isError ? (
        <p role="alert" className="text-body-sm text-negative-darkest">
          Connection lost. The timer is saved; reconnect to update it.{" "}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      <div
        className="flex items-center justify-center gap-2"
        aria-label={`${cycle} of ${state.settings.longBreakEvery} focus sessions in this cycle`}
      >
        {Array.from({ length: state.settings.longBreakEvery }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={cn("size-2.5 rounded-full", index < cycle ? "bg-ink" : "bg-ink/15")}
          />
        ))}
        <span className="ml-2 text-caption text-body">
          Long break every {state.settings.longBreakEvery} sessions
        </span>
      </div>
      {current ? (
        <div className="grid gap-1 border-t border-ink/10 pt-5 text-center">
          <p className="text-caption text-body">
            {kind === "focus" ? "Working on" : "Taking a breather"}
          </p>
          <p className="font-semibold wrap-anywhere">{current.title}</p>
          {current.projectName ? (
            <p className="text-body-sm text-body">{current.projectName}</p>
          ) : null}
        </div>
      ) : kind === "focus" ? (
        <div className="grid gap-4 border-t border-ink/10 pt-5">
          <div className="grid gap-2">
            <Label htmlFor="focus-task">What are you working on?</Label>
            <Select
              value={taskId}
              onValueChange={setTaskId}
              disabled={tasks.isLoading || tasks.isError}
            >
              <SelectTrigger id="focus-task" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="none">Focus without a task</SelectItem>
                {tasks.data?.items
                  .filter((task) => task.status !== "done")
                  .map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {taskId === "none" ? (
            <>
              <Input
                aria-label="Focus session label"
                placeholder="e.g. Build the next feature"
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <div className="grid gap-2">
                <Label htmlFor="focus-project">
                  Project <span className="font-normal text-body">(optional)</span>
                </Label>
                <Select
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={projects.isLoading || projects.isError}
                >
                  <SelectTrigger id="focus-project" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="none">No project</SelectItem>
                    {projects.data?.items
                      .filter((project) => project.status !== "done")
                      .map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.emoji} {project.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : activeTask?.projectId ? (
            <p className="text-body-sm text-body">
              Tracked under{" "}
              {projects.data?.items.find((project) => project.id === activeTask.projectId)?.name ??
                "the task’s project"}
              .
            </p>
          ) : null}
          {tasks.isError || projects.isError ? (
            <p role="alert" className="text-body-sm text-negative-darkest">
              Couldn't load tasks or projects. You can still focus without a task.
            </p>
          ) : null}
        </div>
      ) : null}
      {settingsOpen ? (
        <PomodoroSettingsDialog settings={state.settings} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </section>
  )
}
