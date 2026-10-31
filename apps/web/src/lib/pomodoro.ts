import { queryOptions } from "@tanstack/react-query"
import { parseResponse, type InferRequestType, type InferResponseType } from "hono/client"

import { api } from "./api"

export {
  nextKind,
  plannedSeconds,
  POMODORO_LABELS,
  PomodoroSettingsSchema,
  remainingSeconds,
} from "@cockpit/api/pomodoro"
export type { PomodoroKind, PomodoroSettings } from "@cockpit/api/pomodoro"

export type TimerAction = InferRequestType<typeof api.pomodoro.$post>["json"]
export type TimerState = InferResponseType<typeof api.pomodoro.$get, 200>
export type FocusAnalytics = InferResponseType<typeof api.pomodoro.analytics.$get, 200>

export const pomodoroKey = ["pomodoro"] as const
export const analyticsKey = ["pomodoro-analytics"] as const

export const timerQueryOptions = queryOptions({
  queryKey: pomodoroKey,
  queryFn: async () => {
    const state = await parseResponse(api.pomodoro.$get())
    return { ...state, clockOffset: Date.parse(state.serverNow) - Date.now() }
  },
  refetchInterval: 5000,
  refetchOnWindowFocus: "always",
})

export const analyticsQueryOptions = (from: string, to: string) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return queryOptions({
    queryKey: [...analyticsKey, { from, to, timezone }],
    queryFn: () => parseResponse(api.pomodoro.analytics.$get({ query: { from, to, timezone } })),
    refetchInterval: 60_000,
  })
}

export function clockLabel(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`
}

export function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
}
