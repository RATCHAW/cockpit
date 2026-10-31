import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"
import { project, task } from "./projects"

export const pomodoroKind = pgEnum("pomodoro_kind", ["focus", "short_break", "long_break"])
export const pomodoroStatus = pgEnum("pomodoro_status", [
  "running",
  "paused",
  "completed",
  "interrupted",
])

export const pomodoroSettings = pgTable("pomodoro_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  focusMinutes: integer().notNull().default(25),
  shortBreakMinutes: integer().notNull().default(5),
  longBreakMinutes: integer().notNull().default(15),
  longBreakEvery: integer().notNull().default(4),
  dailyGoal: integer().notNull().default(4),
  soundEnabled: boolean().notNull().default(true),
})

export const pomodoroSession = pgTable(
  "pomodoro_session",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: pomodoroKind().notNull(),
    status: pomodoroStatus().notNull(),
    taskId: uuid().references(() => task.id, { onDelete: "set null" }),
    projectId: uuid().references(() => project.id, { onDelete: "set null" }),
    // Snapshots preserve meaningful reports when a task/project is renamed or deleted.
    title: text().notNull(),
    projectName: text(),
    plannedSeconds: integer().notNull(),
    elapsedSeconds: integer().notNull().default(0),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.userId, t.finishedAt),
    uniqueIndex("pomodoro_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} in ('running', 'paused')`),
    check(
      "pomodoro_duration",
      sql`${t.plannedSeconds} > 0 and ${t.elapsedSeconds} >= 0 and ${t.elapsedSeconds} <= ${t.plannedSeconds}`,
    ),
    check("pomodoro_deadline", sql`(${t.status} = 'running') = (${t.endsAt} is not null)`),
    check(
      "pomodoro_finished",
      sql`(${t.status} in ('completed', 'interrupted')) = (${t.finishedAt} is not null)`,
    ),
  ],
)
