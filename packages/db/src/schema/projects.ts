import { relations } from "drizzle-orm"
import {
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"

export const projectStatus = pgEnum("project_status", ["active", "paused", "done"])
export const habitCadence = pgEnum("habit_cadence", ["daily", "weekly"])
export const taskStatus = pgEnum("task_status", ["todo", "doing", "done"])

const timestamps = {
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

/** Something you're working towards: a marathon, a job, landing a first Upwork gig. */
export const project = pgTable(
  "project",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    /** A single emoji that stands in for the project on cards and task chips. */
    emoji: text().notNull(),
    status: projectStatus().notNull().default("active"),
    /** Race day, exam date, deadline. Optional; ongoing things (a job) have none. */
    targetDate: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
)

/**
 * A recurring commitment that moves a project forward ("send one proposal", "go for a run").
 * Daily habits are due every day; weekly ones `target` times a week (Monday to Sunday).
 */
export const habit = pgTable(
  "habit",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text().notNull(),
    cadence: habitCadence().notNull(),
    /** Days per week for weekly habits. Always 1 for daily ones. */
    target: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
)

/** A day a habit was done. At most one per habit per (local) calendar day. */
export const habitCheckin = pgTable(
  "habit_checkin",
  {
    habitId: uuid()
      .notNull()
      .references(() => habit.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.habitId, t.date] })],
)

/** A one-off thing to do. Linked to a project, or standalone ("go shopping"). */
export const task = pgTable(
  "task",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => project.id, { onDelete: "cascade" }),
    title: text().notNull(),
    notes: text(),
    status: taskStatus().notNull().default("todo"),
    /** Order within a status column, ascending. Moves take the midpoint of their neighbours. */
    position: doublePrecision().notNull(),
    dueDate: date({ mode: "string" }),
    /** When the task last moved to done. Cleared when it moves back. */
    completedAt: timestamp(),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.status)],
)

export const projectRelations = relations(project, ({ many }) => ({
  habits: many(habit),
  tasks: many(task),
}))

export const habitRelations = relations(habit, ({ one, many }) => ({
  project: one(project, { fields: [habit.projectId], references: [project.id] }),
  checkins: many(habitCheckin),
}))

export const habitCheckinRelations = relations(habitCheckin, ({ one }) => ({
  habit: one(habit, { fields: [habitCheckin.habitId], references: [habit.id] }),
}))

export const taskRelations = relations(task, ({ one }) => ({
  project: one(project, { fields: [task.projectId], references: [project.id] }),
}))
