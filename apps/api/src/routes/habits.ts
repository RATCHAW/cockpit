import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"

import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import {
  errorResponse,
  IdParamSchema,
  IsoDateSchema,
  jsonContent,
  NotFoundError,
} from "../lib/openapi"
import { assertOwnedProject, HabitCadenceSchema, isPlausibleDay } from "../lib/projects"
import { Db, runtime } from "../lib/services"

const NameSchema = z.string().trim().min(1).max(80).openapi({ example: "Send one proposal" })
/** Days per week. Ignored (stored as 1) for daily habits. */
const TargetSchema = z.number().int().min(1).max(7)

const HabitInputSchema = z
  .object({
    projectId: z.uuid(),
    name: NameSchema,
    cadence: HabitCadenceSchema,
    target: TargetSchema.default(1),
  })
  .openapi("HabitInput")

const HabitUpdateSchema = z
  .object({ name: NameSchema, cadence: HabitCadenceSchema, target: TargetSchema })
  .partial()
  .openapi("HabitUpdate")

const HabitRecordSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    name: z.string(),
    cadence: HabitCadenceSchema,
    target: z.number().int(),
  })
  .openapi("HabitRecord")

const CheckinParamSchema = IdParamSchema.extend({ date: IsoDateSchema })

type Row = typeof schema.habit.$inferSelect

const toDto = (row: Row) => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  cadence: row.cadence,
  target: row.target,
})

const notFound = errorResponse("Habit not found")

const createHabitRoute = createRoute({
  method: "post",
  path: "/habits",
  tags: ["Projects"],
  summary: "Add a habit to a project",
  description: "Something to do every day, or a number of days each week.",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: HabitInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(HabitRecordSchema, "The created habit"),
    401: { description: "Not signed in" },
    404: errorResponse("Project not found"),
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/habits/{id}",
  tags: ["Projects"],
  summary: "Update a habit",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: HabitUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(HabitRecordSchema, "The updated habit"),
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/habits/{id}",
  tags: ["Projects"],
  summary: "Delete a habit",
  description: "Deletes the habit and its check-in history.",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const checkInRoute = createRoute({
  method: "put",
  path: "/habits/{id}/checkins/{date}",
  tags: ["Projects"],
  summary: "Mark a habit done for a day",
  description: "Idempotent. Past days can be filled in; days after tomorrow are rejected.",
  middleware: [requireAuth] as const,
  request: { params: CheckinParamSchema },
  responses: {
    204: { description: "Checked in" },
    401: { description: "Not signed in" },
    404: notFound,
    422: errorResponse("Date is in the future"),
  },
})

const undoCheckInRoute = createRoute({
  method: "delete",
  path: "/habits/{id}/checkins/{date}",
  tags: ["Projects"],
  summary: "Unmark a habit for a day",
  description: "Idempotent.",
  middleware: [requireAuth] as const,
  request: { params: CheckinParamSchema },
  responses: {
    204: { description: "Check-in removed" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const owned = (userId: string, id: string) =>
  and(eq(schema.habit.id, id), eq(schema.habit.userId, userId))

const assertOwnedHabit = (userId: string, id: string) =>
  Db.use((db) =>
    db.query((db) =>
      db.select({ id: schema.habit.id }).from(schema.habit).where(owned(userId, id)),
    ),
  ).pipe(
    Effect.flatMap(([row]) =>
      row ? Effect.void : Effect.fail(new NotFoundError({ entity: "habit" })),
    ),
  )

/** Daily habits are done once a day, so their weekly target is meaningless. */
const normalizeTarget = <T extends { cadence?: "daily" | "weekly"; target?: number }>(v: T) =>
  v.cadence === "daily" ? { ...v, target: 1 } : v

export const habitRoutes = createRouter()
  .openapi(createHabitRoute, (c) => {
    const user = c.get("user")
    const input = normalizeTarget(c.req.valid("json"))

    const program = assertOwnedProject(user.id, input.projectId).pipe(
      Effect.andThen(
        Db.use((db) =>
          db.query((db) =>
            db
              .insert(schema.habit)
              .values({ ...input, userId: user.id })
              .returning(),
          ),
        ),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map(([row]) => c.json(toDto(row!), 201)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Project not found" }, 404)),
        ),
      ),
    )
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const input = normalizeTarget(c.req.valid("json"))

    const program = Db.use((db) =>
      db.query((db) => db.update(schema.habit).set(input).where(owned(user.id, id)).returning()),
    ).pipe(
      Effect.flatMap(([row]) =>
        row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: "habit" })),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(toDto(row), 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Habit not found" }, 404)),
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
          db.delete(schema.habit).where(owned(user.id, id)).returning({ id: schema.habit.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Habit not found" }, 404)
  })
  .openapi(checkInRoute, (c) => {
    const user = c.get("user")
    const { id, date } = c.req.valid("param")
    if (!isPlausibleDay(date)) {
      return c.json({ error: "You can't check in for a day that hasn't happened yet" }, 422)
    }

    const program = assertOwnedHabit(user.id, id).pipe(
      Effect.andThen(
        Db.use((db) =>
          db.query((db) =>
            db.insert(schema.habitCheckin).values({ habitId: id, date }).onConflictDoNothing(),
          ),
        ),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map(() => c.body(null, 204)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Habit not found" }, 404)),
        ),
      ),
    )
  })
  .openapi(undoCheckInRoute, (c) => {
    const user = c.get("user")
    const { id, date } = c.req.valid("param")

    const program = assertOwnedHabit(user.id, id).pipe(
      Effect.andThen(
        Db.use((db) =>
          db.query((db) =>
            db
              .delete(schema.habitCheckin)
              .where(and(eq(schema.habitCheckin.habitId, id), eq(schema.habitCheckin.date, date))),
          ),
        ),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map(() => c.body(null, 204)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Habit not found" }, 404)),
        ),
      ),
    )
  })
