import { addDays, daysBetween } from "./dates"
import type { FocusSession, sessionDto } from "./pomodoro"

export function dateInTimezone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function focusAnalytics(
  rows: FocusSession[],
  { from, to, timezone, today }: { from: string; to: string; timezone: string; today: string },
) {
  const series = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => ({
    date: addDays(from, i),
    seconds: 0,
    completed: 0,
    interrupted: 0,
  }))
  const byDate = new Map(series.map((day) => [day.date, day]))
  const projects = new Map<string, { name: string; seconds: number; completed: number }>()
  const completedDays = new Set<string>()
  const todayStats = { seconds: 0, completed: 0 }
  const sessions: ReturnType<typeof sessionDto>[] = []

  for (const row of rows) {
    if (row.kind !== "focus" || !row.finishedAt) continue
    const date = dateInTimezone(row.finishedAt, timezone)
    if (row.status === "completed") completedDays.add(date)
    if (date === today) {
      todayStats.seconds += row.elapsedSeconds
      if (row.status === "completed") todayStats.completed++
    }
    const day = byDate.get(date)
    if (!day) continue
    day.seconds += row.elapsedSeconds
    if (row.status === "completed") day.completed++
    if (row.status === "interrupted") day.interrupted++
    const name = row.projectName ?? "No project"
    const group = projects.get(name) ?? { name, seconds: 0, completed: 0 }
    group.seconds += row.elapsedSeconds
    if (row.status === "completed") group.completed++
    projects.set(name, group)
    sessions.push({
      ...row,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt.toISOString(),
      endsAt: null,
    })
  }
  const summary = series.reduce(
    (total, day) => ({
      seconds: total.seconds + day.seconds,
      completed: total.completed + day.completed,
      interrupted: total.interrupted + day.interrupted,
      activeDays: total.activeDays + Number(day.seconds > 0),
    }),
    { seconds: 0, completed: 0, interrupted: 0, activeDays: 0 },
  )
  let streak = 0
  let day = completedDays.has(today) ? today : addDays(today, -1)
  while (completedDays.has(day)) {
    streak++
    day = addDays(day, -1)
  }
  return {
    series,
    summary,
    today: todayStats,
    streak,
    projects: [...projects.values()].sort((a, b) => b.seconds - a.seconds),
    sessions: sessions
      .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))
      .slice(0, 50),
  }
}
