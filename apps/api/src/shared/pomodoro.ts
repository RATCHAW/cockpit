import { z } from "zod"

export const PomodoroKindSchema = z.enum(["focus", "short_break", "long_break"])
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
} satisfies Record<PomodoroKind, string>

export function plannedSeconds(kind: PomodoroKind, settings: PomodoroSettings) {
  const minutes = {
    focus: settings.focusMinutes,
    short_break: settings.shortBreakMinutes,
    long_break: settings.longBreakMinutes,
  }
  return minutes[kind] * 60
}

export function nextKind(
  last: { kind: PomodoroKind; status: string } | null,
  completed: number,
  every: number,
): PomodoroKind {
  return last?.kind === "focus" && last.status === "completed"
    ? completed % every === 0
      ? "long_break"
      : "short_break"
    : "focus"
}

export function remainingSeconds(
  session: {
    status: string
    endsAt: string | null
    plannedSeconds: number
    elapsedSeconds: number
  },
  now: number,
) {
  return session.status === "running" && session.endsAt
    ? Math.max(
        0,
        Math.min(
          session.plannedSeconds - session.elapsedSeconds,
          Math.ceil((Date.parse(session.endsAt) - now) / 1000),
        ),
      )
    : Math.max(0, session.plannedSeconds - session.elapsedSeconds)
}
