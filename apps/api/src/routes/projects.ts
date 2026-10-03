import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, count, eq, inArray, sql } from "drizzle-orm"
import { Effect } from "effect"

import { addDays, today } from "../lib/dates"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import {
  errorResponse,
  IdParamSchema,
  IsoDateSchema,
  jsonContent,
  NotFoundError,
} from "../lib/openapi"
import {
  HabitCadenceSchema,
  ProjectStatusSchema,
  streak,
  TaskStatusSchema,
  TodayQuery,
} from "../lib/projects"
import { Db, runtime } from "../lib/services"
import { HABIT_HISTORY_DAYS, type TaskStatus } from "../shared/projects"

const ProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80).openapi({ example: "Run a marathon" }),
    description: z.string().trim().max(500).nullable().optional(),
    emoji: z.string().trim().min(1).max(16).openapi({ example: "🏃" }),
    status: ProjectStatusSchema.default("active"),
    targetDate: IsoDateSchema.nullable().optional(),
  })
  .openapi("ProjectInput")

const ProjectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable(),
    emoji: z.string().trim().min(1).max(16),
    status: ProjectStatusSchema,
    targetDate: IsoDateSchema.nullable(),
  })
  .partial()
  .openapi("ProjectUpdate")

const HabitSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    name: z.string(),
    cadence: HabitCadenceSchema,
    /** Days per week for weekly habits; 1 for daily ones. */
    target: z.number().int(),
    /** Days or weeks in a row the habit was kept. */
    streak: z.number().int(),
    /** Days it was done, oldest first, going back `HABIT_HISTORY_DAYS`. */
    checkins: z.array(IsoDateSchema),
  })
  .openapi("Habit")

const ProjectSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    emoji: z.string(),
    status: ProjectStatusSchema,
    targetDate: IsoDateSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("Project")

const ProjectWithDetailsSchema = ProjectSchema.extend({
  habits: z.array(HabitSchema),
  /** Number of tasks in each board column. */
  tasks: z.record(TaskStatusSchema, z.number().int()),
}).openapi("ProjectWithDetails")

const ProjectListSchema = z
  .object({ today: IsoDateSchema, items: z.array(ProjectWithDetailsSchema) })
  .openapi("ProjectList")

type Row = typeof schema.project.$inferSelect

const toDto = (row: Row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  emoji: row.emoji,
  status: row.status,
  targetDate: row.targetDate,
  createdAt: row.createdAt.toISOString(),
})

const notFound = errorResponse("Project not found")

const listRoute = createRoute({
  method: "get",
  path: "/projects",
  tags: ["Projects"],
  summary: "List projects",
  description:
    "Every project with its habits (streaks and recent check-ins) and task counts. Active " +
    "projects come first, then paused, then done; each group by target date.",
  middleware: [requireAuth] as const,
  request: { query: TodayQuery },
  responses: {
    200: jsonContent(ProjectListSchema, "Projects"),
    401: { description: "Not signed in" },
  },
})

const createProjectRoute = createRoute({
  method: "post",
  path: "/projects",
  tags: ["Projects"],
  summary: "Create a project",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: ProjectInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(ProjectSchema, "The created project"),
    401: { description: "Not signed in" },
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/projects/{id}",
  tags: ["Projects"],
  summary: "Update a project",
  description: "Rename it, change its target date, or pause it or mark it done.",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: ProjectUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(ProjectSchema, "The updated project"),
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/projects/{id}",
  tags: ["Projects"],
  summary: "Delete a project",
  description: "Deletes the project along with its habits, their check-ins, and its tasks.",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const owned = (userId: string, id: string) =>
  and(eq(schema.project.id, id), eq(schema.project.userId, userId))

export const projectRoutes = createRouter()
  .openapi(listRoute, async (c) => {
    const user = c.get("user")
    const now = c.req.valid("query").today ?? today()

    const program = Effect.gen(function* () {
      const db = yield* Db
      const [projects, habits, taskCounts] = yield* Effect.all(
        [
          db.query((db) =>
            db
              .select()
              .from(schema.project)
              .where(eq(schema.project.userId, user.id))
              // Enums sort in declaration order: active, paused, done.
              .orderBy(
                asc(schema.project.status),
                sql`${schema.project.targetDate} asc nulls last`,
                asc(schema.project.createdAt),
              ),
          ),
          db.query((db) =>
            db
              .select()
              .from(schema.habit)
              .where(eq(schema.habit.userId, user.id))
              .orderBy(asc(schema.habit.createdAt)),
          ),
          db.query((db) =>
            db
              .select({
                projectId: schema.task.projectId,
                status: schema.task.status,
                count: count(),
              })
              .from(schema.task)
              .where(eq(schema.task.userId, user.id))
              .groupBy(schema.task.projectId, schema.task.status),
          ),
        ],
        { concurrency: "unbounded" },
      )

      // Streaks need the full history; it's one short row per habit per day.
      const checkins =
        habits.length === 0
          ? []
          : yield* db.query((db) =>
              db
                .select({ habitId: schema.habitCheckin.habitId, date: schema.habitCheckin.date })
                .from(schema.habitCheckin)
                .where(
                  inArray(
                    schema.habitCheckin.habitId,
                    habits.map((h) => h.id),
                  ),
                )
                .orderBy(asc(schema.habitCheckin.date)),
            )

      const datesByHabit = new Map<string, string[]>()
      for (const { habitId, date } of checkins) {
        const dates = datesByHabit.get(habitId) ?? []
        dates.push(date)
        datesByHabit.set(habitId, dates)
      }

      const historyFrom = addDays(now, -(HABIT_HISTORY_DAYS - 1))
      const habitsByProject = new Map<string, z.infer<typeof HabitSchema>[]>()
      for (const h of habits) {
        const dates = datesByHabit.get(h.id) ?? []
        const list = habitsByProject.get(h.projectId) ?? []
        list.push({
          id: h.id,
          projectId: h.projectId,
          name: h.name,
          cadence: h.cadence,
          target: h.target,
          streak: streak(h, new Set(dates), now),
          checkins: dates.filter((d) => d >= historyFrom && d <= now),
        })
        habitsByProject.set(h.projectId, list)
      }

      const countsByProject = new Map<string, Record<TaskStatus, number>>()
      for (const row of taskCounts) {
        if (!row.projectId) continue
        const counts = countsByProject.get(row.projectId) ?? { todo: 0, doing: 0, done: 0 }
        counts[row.status] = row.count
        countsByProject.set(row.projectId, counts)
      }

      return {
        today: now,
        items: projects.map((p) => ({
          ...toDto(p),
          habits: habitsByProject.get(p.id) ?? [],
          tasks: countsByProject.get(p.id) ?? { todo: 0, doing: 0, done: 0 },
        })),
      }
    })

    return c.json(await runtime.runPromise(program), 200)
  })
  .openapi(createProjectRoute, async (c) => {
    const user = c.get("user")
    const input = c.req.valid("json")
    const [row] = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.project)
            .values({
              ...input,
              description: input.description || null,
              targetDate: input.targetDate ?? null,
              userId: user.id,
            })
            .returning(),
        ),
      ),
    )
    return c.json(toDto(row!), 201)
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const input = c.req.valid("json")
    const changes =
      input.description === undefined ? input : { ...input, description: input.description || null }

    const program = Db.use((db) =>
      db.query((db) =>
        db.update(schema.project).set(changes).where(owned(user.id, id)).returning(),
      ),
    ).pipe(
      Effect.flatMap(([row]) =>
        row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: "project" })),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(toDto(row), 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Project not found" }, 404)),
        ),
      ),
    )
  })
  .openapi(deleteRoute, async (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const deleted = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db.delete(schema.project).where(owned(user.id, id)).returning({ id: schema.project.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Project not found" }, 404)
  })
