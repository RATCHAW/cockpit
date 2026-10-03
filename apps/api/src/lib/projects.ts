import { schema } from "@cockpit/db"
import { z } from "@hono/zod-openapi"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"

import { HABIT_CADENCES, PROJECT_STATUSES, TASK_STATUSES } from "../shared/projects"
import { addDays, daysBetween, today, type IsoDate } from "./dates"
import { IsoDateSchema, NotFoundError } from "./openapi"
import { Db } from "./services"

// ── Shared schemas ────────────────────────────────────────────────────────────

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES).openapi("ProjectStatus")
export const HabitCadenceSchema = z.enum(HABIT_CADENCES).openapi("HabitCadence")
export const TaskStatusSchema = z.enum(TASK_STATUSES).openapi("TaskStatus")

/**
 * The caller's local date. Streaks and "done today" depend on where the day starts, which the
 * server can't know, so the web app sends it. Defaults to the UTC date.
 */
export const TodayQuery = z.object({
  today: IsoDateSchema.optional().openapi({ description: "Your local date (YYYY-MM-DD)" }),
})

/** Local dates can run up to a day ahead of UTC (UTC+14); anything later is a typo. */
export const isPlausibleDay = (date: IsoDate) => daysBetween(today(), date) <= 1

/** Fails with `NotFoundError` unless the project exists and belongs to the user. */
export const assertOwnedProject = (userId: string, projectId: string) =>
  Db.use((db) =>
    db.query((db) =>
      db
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(and(eq(schema.project.id, projectId), eq(schema.project.userId, userId))),
    ),
  ).pipe(
    Effect.flatMap(([row]) =>
      row ? Effect.void : Effect.fail(new NotFoundError({ entity: "project" })),
    ),
  )

// ── Streaks ───────────────────────────────────────────────────────────────────

/** Monday of the week `date` falls in. Weeks run Monday to Sunday. */
export function weekStart(date: IsoDate): IsoDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

type HabitRule = { cadence: "daily" | "weekly"; target: number }

/**
 * Consecutive days (daily) or weeks (weekly) the habit was kept, counting back from `today`.
 * The current day or week only counts once it's met — but not having done it *yet* doesn't
 * break the streak.
 */
export function streak({ cadence, target }: HabitRule, dates: ReadonlySet<IsoDate>, now: IsoDate) {
  if (cadence === "daily") {
    let day = dates.has(now) ? now : addDays(now, -1)
    let count = 0
    while (dates.has(day)) {
      count++
      day = addDays(day, -1)
    }
    return count
  }

  const perWeek = new Map<IsoDate, number>()
  for (const date of dates) {
    if (date > now) continue
    const week = weekStart(date)
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }
  const met = (week: IsoDate) => (perWeek.get(week) ?? 0) >= target
  let week = weekStart(now)
  if (!met(week)) week = addDays(week, -7)
  let count = 0
  while (met(week)) {
    count++
    week = addDays(week, -7)
  }
  return count
}
