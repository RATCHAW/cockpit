import type { HabitCadence, ProjectStatus, TaskStatus } from "@cockpit/api/projects"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { parseResponse, type InferResponseType } from "hono/client"

import { api } from "./api"
import { formatDate, isoDate } from "./finance"

export {
  HABIT_CADENCES,
  HABIT_HISTORY_WEEKS,
  PROJECT_EMOJIS,
  PROJECT_STATUSES,
  TASK_STATUSES,
} from "@cockpit/api/projects"
export type { HabitCadence, ProjectStatus, TaskStatus }

export type ProjectList = InferResponseType<typeof api.projects.$get, 200>
export type Project = ProjectList["items"][number]
export type Habit = Project["habits"][number]
export type Task = InferResponseType<typeof api.tasks.$get, 200>["items"][number]

// ── Queries ───────────────────────────────────────────────────────────────────

export const projectsKey = ["projects"] as const
export const tasksKey = ["tasks"] as const

/** The local calendar date; habits roll over at your midnight, not the server's. */
export const localToday = () => isoDate(new Date())

export const projectsQueryOptions = (today = localToday()) =>
  queryOptions({
    queryKey: [...projectsKey, { today }],
    queryFn: () => parseResponse(api.projects.$get({ query: { today } })),
  })

export const tasksQueryOptions = queryOptions({
  queryKey: tasksKey,
  queryFn: () => parseResponse(api.tasks.$get()),
})

/** Task changes move project task counts, and project changes relabel tasks: refresh both. */
export const refreshProjectsAndTasks = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: projectsKey }),
    queryClient.invalidateQueries({ queryKey: tasksKey }),
  ])

// ── Labels ────────────────────────────────────────────────────────────────────

export const PROJECT_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  done: "Done",
} satisfies Record<ProjectStatus, string>

export const TASK_STATUS_LABELS = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
} satisfies Record<TaskStatus, string>

export function describeHabit({ cadence, target }: Pick<Habit, "cadence" | "target">) {
  if (cadence === "daily") return "Every day"
  return target === 1 ? "Once a week" : `${target}× a week`
}

export function describeStreak({ cadence, streak }: Pick<Habit, "cadence" | "streak">) {
  const unit = cadence === "daily" ? "day" : "week"
  return `${streak} ${unit}${streak === 1 ? "" : "s"}`
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const parse = (date: string) => new Date(`${date}T00:00:00`)

export function addDays(date: string, days: number) {
  const d = parse(date)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export const daysBetween = (from: string, to: string) =>
  Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000)

/** Monday of the week `date` falls in. Matches the API's week boundaries. */
export function weekStart(date: string) {
  return addDays(date, -((parse(date).getDay() + 6) % 7))
}

/** "Apr 12" this year, "Apr 12, 2027" otherwise. */
export function formatShortDate(date: string, today = localToday()) {
  return formatDate(date, {
    month: "short",
    day: "numeric",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  })
}

/** "in 3 days", "tomorrow", "today", "2 days ago". */
export function relativeDays(date: string, today = localToday()) {
  const days = daysBetween(today, date)
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  if (Math.abs(days) < 60) return days > 0 ? `in ${days} days` : `${-days} days ago`
  const months = Math.round(Math.abs(days) / 30.44)
  return days > 0 ? `in ${months} months` : `${months} months ago`
}

// ── Habit progress ────────────────────────────────────────────────────────────

export function habitProgress(habit: Habit, today: string) {
  const doneToday = habit.checkins.includes(today)
  const monday = weekStart(today)
  const thisWeek = habit.checkins.filter((d) => d >= monday && d <= today).length
  const met = habit.cadence === "daily" ? doneToday : thisWeek >= habit.target
  return { doneToday, thisWeek, met }
}

/** Returns a copy of the project list with one habit's check-in for `date` toggled. */
export function toggleCheckin(data: ProjectList, habitId: string, date: string, done: boolean) {
  return {
    ...data,
    items: data.items.map((p) => ({
      ...p,
      habits: p.habits.map((h) =>
        h.id !== habitId
          ? h
          : {
              ...h,
              checkins: done
                ? [...h.checkins.filter((d) => d !== date), date].sort()
                : h.checkins.filter((d) => d !== date),
            },
      ),
    })),
  }
}
