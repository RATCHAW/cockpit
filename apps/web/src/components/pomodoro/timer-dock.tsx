import { Button } from "@cockpit/ui/components/button"
import { Link, useLocation } from "@tanstack/react-router"
import { PauseIcon, PlayIcon, TimerIcon } from "lucide-react"

import { usePomodoro } from "~/hooks/use-pomodoro"
import { clockLabel, POMODORO_LABELS } from "~/lib/pomodoro"

export function TimerDock() {
  const { current, remaining, act, pending } = usePomodoro()
  const location = useLocation()
  if (!current || location.pathname === "/pomodoro") return null
  return (
    <div className="sticky bottom-4 z-20 mx-4 mt-6 flex max-w-xl items-center gap-4 rounded-xl bg-ink p-4 text-canvas shadow-lg sm:mx-auto">
      <TimerIcon className="size-5 shrink-0" aria-hidden />
      <Link
        to="/pomodoro"
        className="grid min-w-0 flex-1 gap-0.5 rounded-sm focus-visible:outline-2"
      >
        <span className="truncate text-body-sm font-semibold">
          {POMODORO_LABELS[current.kind]} · {current.title}
        </span>
        <span className="text-body-lg font-semibold tabular-nums">
          {clockLabel(remaining)}
          {current.status === "paused" ? " · Paused" : ""}
        </span>
      </Link>
      <Button
        size="icon-sm"
        disabled={pending || remaining === 0}
        aria-label={current.status === "running" ? "Pause timer" : "Resume timer"}
        onClick={() =>
          act({ action: current.status === "running" ? "pause" : "resume", id: current.id })
        }
      >
        {current.status === "running" ? <PauseIcon /> : <PlayIcon />}
      </Button>
    </div>
  )
}
