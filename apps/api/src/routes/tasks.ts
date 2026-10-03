import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, eq, min } from "drizzle-orm"
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
import { assertOwnedProject, TaskStatusSchema } from "../lib/projects"
import { Db, runtime } from "../lib/services"

const TitleSchema = z.string().trim().min(1).max(200).openapi({ example: "Go shopping" })
const NotesSchema = z.string().trim().max(5000).nullable()
/** Order within the status column, ascending. Omit to put the task at the top. */
const PositionSchema = z.number().finite()

const TaskInputSchema = z
  .object({
    title: TitleSchema,
    notes: NotesSchema.optional(),
    /** Null for a standalone task. */
    projectId: z.uuid().nullable().optional(),
    status: TaskStatusSchema.default("todo"),
    position: PositionSchema.optional(),
    dueDate: IsoDateSchema.nullable().optional(),
  })
  .openapi("TaskInput")

const TaskUpdateSchema = z
  .object({
    title: TitleSchema,
    notes: NotesSchema,
    projectId: z.uuid().nullable(),
    status: TaskStatusSchema,
    position: PositionSchema,
    dueDate: IsoDateSchema.nullable(),
  })
  .partial()
  .openapi("TaskUpdate")

const TaskSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    notes: z.string().nullable(),
    projectId: z.uuid().nullable(),
    status: TaskStatusSchema,
    position: z.number(),
    dueDate: IsoDateSchema.nullable(),
    completedAt: z.iso.datetime().nullable(),
  })
  .openapi("Task")

const TaskListSchema = z.object({ items: z.array(TaskSchema) }).openapi("TaskList")

type Row = typeof schema.task.$inferSelect

const toDto = (row: Row) => ({
  id: row.id,
  title: row.title,
  notes: row.notes,
  projectId: row.projectId,
  status: row.status,
  position: row.position,
  dueDate: row.dueDate,
  completedAt: row.completedAt?.toISOString() ?? null,
})

const notFound = errorResponse("Task not found")

const listRoute = createRoute({
  method: "get",
  path: "/tasks",
  tags: ["Tasks"],
  summary: "List tasks",
  description: "Every task on the board, by column and then position.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonContent(TaskListSchema, "Tasks"),
    401: { description: "Not signed in" },
  },
})

const createTaskRoute = createRoute({
  method: "post",
  path: "/tasks",
  tags: ["Tasks"],
  summary: "Add a task",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: TaskInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(TaskSchema, "The created task"),
    401: { description: "Not signed in" },
    404: errorResponse("Project not found"),
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/tasks/{id}",
  tags: ["Tasks"],
  summary: "Update or move a task",
  description:
    "Moving to another column without a `position` puts the task at the top of that column.",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: TaskUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(TaskSchema, "The updated task"),
    401: { description: "Not signed in" },
    404: errorResponse("Task or project not found"),
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/tasks/{id}",
  tags: ["Tasks"],
  summary: "Delete a task",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const owned = (userId: string, id: string) =>
  and(eq(schema.task.id, id), eq(schema.task.userId, userId))

type Status = Row["status"]

/** A position above everything currently in the column. */
const topOf = (userId: string, status: Status) =>
  Db.use((db) =>
    db.query((db) =>
      db
        .select({ top: min(schema.task.position) })
        .from(schema.task)
        .where(and(eq(schema.task.userId, userId), eq(schema.task.status, status))),
    ),
  ).pipe(Effect.map(([row]) => (row?.top ?? 1) - 1))

const notFoundMessage = (entity: string) =>
  entity === "project" ? "Project not found" : "Task not found"

export const taskRoutes = createRouter()
  .openapi(listRoute, async (c) => {
    const user = c.get("user")
    const rows = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .select()
            .from(schema.task)
            .where(eq(schema.task.userId, user.id))
            .orderBy(asc(schema.task.status), asc(schema.task.position)),
        ),
      ),
    )
    return c.json({ items: rows.map(toDto) }, 200)
  })
  .openapi(createTaskRoute, (c) => {
    const user = c.get("user")
    const input = c.req.valid("json")

    const program = Effect.gen(function* () {
      if (input.projectId) yield* assertOwnedProject(user.id, input.projectId)
      const position = input.position ?? (yield* topOf(user.id, input.status))
      const [row] = yield* Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.task)
            .values({
              ...input,
              notes: input.notes || null,
              projectId: input.projectId ?? null,
              dueDate: input.dueDate ?? null,
              position,
              completedAt: input.status === "done" ? new Date() : null,
              userId: user.id,
            })
            .returning(),
        ),
      )
      return row!
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(toDto(row), 201)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Project not found" }, 404)),
        ),
      ),
    )
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const input = c.req.valid("json")

    const program = Effect.gen(function* () {
      const db = yield* Db
      const [current] = yield* db.query((db) =>
        db.select().from(schema.task).where(owned(user.id, id)),
      )
      if (!current) return yield* Effect.fail(new NotFoundError({ entity: "task" }))
      if (input.projectId) yield* assertOwnedProject(user.id, input.projectId)

      const moved = input.status !== undefined && input.status !== current.status
      const changes: Partial<typeof schema.task.$inferInsert> = { ...input }
      if (input.notes !== undefined) changes.notes = input.notes || null
      if (moved) {
        changes.position = input.position ?? (yield* topOf(user.id, input.status!))
        changes.completedAt = input.status === "done" ? new Date() : null
      }

      const [row] = yield* db.query((db) =>
        db.update(schema.task).set(changes).where(owned(user.id, id)).returning(),
      )
      return row!
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(toDto(row), 200)),
        Effect.catchTag("NotFoundError", (e) =>
          Effect.succeed(c.json({ error: notFoundMessage(e.entity) }, 404)),
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
          db.delete(schema.task).where(owned(user.id, id)).returning({ id: schema.task.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Task not found" }, 404)
  })
