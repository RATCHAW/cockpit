import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq } from "drizzle-orm"
import { Effect } from "effect"

import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import { errorResponse, IdParamSchema, jsonContent, NotFoundError } from "../lib/openapi"
import { Db, runtime } from "../lib/services"
import { IDEA_MAX_LENGTH } from "../shared/ideas"

const ContentSchema = z.string().trim().min(1).max(IDEA_MAX_LENGTH)
const IdeaInputSchema = z.object({ content: ContentSchema }).openapi("IdeaInput")
const IdeaUpdateSchema = z
  .object({ content: ContentSchema.optional(), archived: z.boolean().optional() })
  .refine((value) => value.content !== undefined || value.archived !== undefined, {
    message: "Provide content or archived",
  })
  .openapi("IdeaUpdate")
const IdeaSchema = z
  .object({
    id: z.uuid(),
    content: z.string(),
    archived: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Idea")

const toDto = (row: typeof schema.idea.$inferSelect) => ({
  id: row.id,
  content: row.content,
  archived: row.archived,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const owned = (userId: string, id: string) =>
  and(eq(schema.idea.userId, userId), eq(schema.idea.id, id))

const listRoute = createRoute({
  method: "get",
  path: "/ideas",
  tags: ["Ideas"],
  summary: "List your ideas, newest first",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonContent(z.object({ items: z.array(IdeaSchema) }).openapi("IdeaList"), "Ideas"),
    401: { description: "Not signed in" },
  },
})

const createIdeaRoute = createRoute({
  method: "post",
  path: "/ideas",
  tags: ["Ideas"],
  summary: "Capture an idea",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: IdeaInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(IdeaSchema, "The saved idea"),
    401: { description: "Not signed in" },
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/ideas/{id}",
  tags: ["Ideas"],
  summary: "Edit, archive, or restore an idea",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: IdeaUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(IdeaSchema, "The updated idea"),
    401: { description: "Not signed in" },
    404: errorResponse("Idea not found"),
  },
})

export const ideaRoutes = createRouter()
  .openapi(listRoute, async (c) => {
    const user = c.get("user")
    const rows = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .select()
            .from(schema.idea)
            .where(eq(schema.idea.userId, user.id))
            .orderBy(desc(schema.idea.createdAt), desc(schema.idea.id)),
        ),
      ),
    )
    return c.json({ items: rows.map(toDto) }, 200)
  })
  .openapi(createIdeaRoute, async (c) => {
    const user = c.get("user")
    const input = c.req.valid("json")
    const row = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.idea)
            .values({ ...input, userId: user.id })
            .returning(),
        ),
      ).pipe(Effect.map(([row]) => row!)),
    )
    return c.json(toDto(row), 201)
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const input = c.req.valid("json")
    return runtime.runPromise(
      Db.use((db) =>
        db.query((db) => db.update(schema.idea).set(input).where(owned(user.id, id)).returning()),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: "idea" })),
        ),
        Effect.map((row) => c.json(toDto(row), 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Idea not found" }, 404)),
        ),
      ),
    )
  })
