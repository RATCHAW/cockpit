import { z } from "zod"

export const PomodoroKindSchema = z.enum(["focus", "short_break", "long_break", "flow"])
export const PomodoroSettingsSchema = z.object({
  focusMinutes: z.number().int().min(1).max(180),
  shortBreakMinutes: z.number().int().min(1).max(60),
  longBreakMinutes: z.number().int().min(1).max(60),
  longBreakEvery: z.number().int().min(2).max(12),
  dailyGoal: z.number().int().min(1).max(20),
  soundEnabled: z.boolean(),
})

export type PomodoroKind = z.infer<typeof PomodoroKindSchema>
export type PomodoroSettings = z.infer<typeof PomodoroSettingsSchema>

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  dailyGoal: 4,
  soundEnabled: true,
}

export const POMODORO_LABELS = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
  flow: "Flow",
} satisfies Record<PomodoroKind, string>

export type CountdownKind = Exclude<PomodoroKind, "flow">

export function plannedSeconds(kind: CountdownKind, settings: PomodoroSettings): number
export function plannedSeconds(kind: PomodoroKind, settings: PomodoroSettings): number | null
export function plannedSeconds(kind: PomodoroKind, settings: PomodoroSettings) {
  const minutes = {
    focus: settings.focusMinutes,
    short_break: settings.shortBreakMinutes,
    long_break: settings.longBreakMinutes,
    flow: null,
  }[kind]
  return minutes === null ? null : minutes * 60
}

export function nextKind(
  last: { kind: PomodoroKind; status: string } | null,
  completed: number,
  every: number,
): PomodoroKind {
  if (last?.kind === "flow") return "flow"
  return last?.kind === "focus" && last.status === "completed"
    ? completed % every === 0
      ? "long_break"
      : "short_break"
    : "focus"
}

type LiveSession = {
  status: string
  resumedAt: string | Date | null
  plannedSeconds: number | null
  elapsedSeconds: number
}

export function liveElapsedSeconds(session: LiveSession, now: number) {
  const stretch =
    session.status === "running" && session.resumedAt
      ? Math.max(0, Math.floor((now - new Date(session.resumedAt).getTime()) / 1000))
      : 0
  const elapsed = session.elapsedSeconds + stretch
  return session.plannedSeconds === null ? elapsed : Math.min(session.plannedSeconds, elapsed)
}

/** Null for flow sessions, which count up instead of down. */
export function remainingSeconds(session: LiveSession, now: number) {
  return session.plannedSeconds === null
    ? null
    : session.plannedSeconds - liveElapsedSeconds(session, now)
}

export function clockLabel(seconds: number) {
  const pad = (value: number) => Math.floor(value).toString().padStart(2, "0")
  const hours = Math.floor(seconds / 3600)
  const clock = `${pad((seconds % 3600) / 60)}:${pad(seconds % 60)}`
  return hours ? `${hours}:${clock}` : clock
}
