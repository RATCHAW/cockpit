import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, eq, ne, sql } from "drizzle-orm"
import { Data, Effect } from "effect"

import { CategorySchema, KindSchema } from "../lib/finance"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import { errorResponse, IdParamSchema, jsonContent, NotFoundError } from "../lib/openapi"
import { Db, runtime } from "../lib/services"

class CategoryTakenError extends Data.TaggedError("CategoryTakenError")<{ name: string }> {}

const FinanceCategorySchema = z
  .object({ id: z.uuid(), kind: KindSchema, name: z.string() })
  .openapi("Category")

const CategoryListSchema = z
  .object({ items: z.array(FinanceCategorySchema) })
  .openapi("CategoryList")

const CategoryInputSchema = z
  .object({ kind: KindSchema, name: CategorySchema })
  .openapi("CategoryInput")

const CategoryUpdateSchema = z.object({ name: CategorySchema }).openapi("CategoryUpdate")

const columns = {
  id: schema.financeCategory.id,
  kind: schema.financeCategory.kind,
  name: schema.financeCategory.name,
}

const notFound = errorResponse("Category not found")
const nameTaken = errorResponse("You already have a category with that name for this kind")
const nameTakenBody = (name: string) => ({ error: `You already have a category called ${name}.` })

const listRoute = createRoute({
  method: "get",
  path: "/finance/categories",
  tags: ["Finance"],
  summary: "List categories",
  description: "Expense categories, then income ones, each alphabetical.",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonContent(CategoryListSchema, "Your categories"),
    401: { description: "Not signed in" },
  },
})

const createCategoryRoute = createRoute({
  method: "post",
  path: "/finance/categories",
  tags: ["Finance"],
  summary: "Add a category",
  description: "Names are unique per kind, ignoring case.",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: CategoryInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(FinanceCategorySchema, "The created category"),
    401: { description: "Not signed in" },
    409: nameTaken,
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/finance/categories/{id}",
  tags: ["Finance"],
  summary: "Rename a category",
  description:
    "Renames the category along with every transaction and schedule filed under it, so past " +
    "spending moves to the new name.",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: CategoryUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(FinanceCategorySchema, "The renamed category"),
    401: { description: "Not signed in" },
    404: notFound,
    409: nameTaken,
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/finance/categories/{id}",
  tags: ["Finance"],
  summary: "Remove a category",
  description:
    "Takes it off the list you pick from. Transactions and schedules filed under it keep the name.",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Removed" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const owned = (userId: string, id: string) =>
  and(eq(schema.financeCategory.id, id), eq(schema.financeCategory.userId, userId))

const rename = (userId: string, id: string, name: string) =>
  Db.use((db) =>
    db.query((db) =>
      db.transaction(async (tx) => {
        // Locked so a concurrent rename of this category waits, then sees the name records now
        // carry. Unlocked, it would match the old name and leave the moved records behind.
        const [current] = await tx
          .select(columns)
          .from(schema.financeCategory)
          .where(owned(userId, id))
          .for("update")
        if (!current) return new NotFoundError({ entity: "category" })
        if (current.name === name) return current

        const [clash] = await tx
          .select({ id: schema.financeCategory.id })
          .from(schema.financeCategory)
          .where(
            and(
              eq(schema.financeCategory.userId, userId),
              eq(schema.financeCategory.kind, current.kind),
              ne(schema.financeCategory.id, id),
              sql`lower(${schema.financeCategory.name}) = lower(${name})`,
            ),
          )
        if (clash) return new CategoryTakenError({ name })

        const [row] = await tx
          .update(schema.financeCategory)
          .set({ name })
          .where(eq(schema.financeCategory.id, id))
          .returning(columns)
        for (const table of [schema.recurringTransaction, schema.transaction]) {
          await tx
            .update(table)
            .set({ category: name })
            .where(
              and(
                eq(table.userId, userId),
                eq(table.kind, current.kind),
                eq(table.category, current.name),
              ),
            )
        }
        return row!
      }),
    ),
  ).pipe(
    Effect.flatMap((result) =>
      result instanceof NotFoundError || result instanceof CategoryTakenError
        ? Effect.fail(result)
        : Effect.succeed(result),
    ),
  )

export const categoryRoutes = createRouter()
  .openapi(listRoute, async (c) => {
    const user = c.get("user")
    const items = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .select(columns)
            .from(schema.financeCategory)
            .where(eq(schema.financeCategory.userId, user.id))
            .orderBy(
              asc(schema.financeCategory.kind),
              asc(sql`lower(${schema.financeCategory.name})`),
            ),
        ),
      ),
    )
    return c.json({ items }, 200)
  })
  .openapi(createCategoryRoute, (c) => {
    const user = c.get("user")
    const input = c.req.valid("json")

    const program = Db.use((db) =>
      db.query((db) =>
        db
          .insert(schema.financeCategory)
          .values({ ...input, userId: user.id })
          .onConflictDoNothing()
          .returning(columns),
      ),
    ).pipe(
      Effect.flatMap(([row]) =>
        row ? Effect.succeed(row) : Effect.fail(new CategoryTakenError({ name: input.name })),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(row, 201)),
        Effect.catchTag("CategoryTakenError", (e) =>
          Effect.succeed(c.json(nameTakenBody(e.name), 409)),
        ),
      ),
    )
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const { name } = c.req.valid("json")

    return runtime.runPromise(
      rename(user.id, id, name).pipe(
        Effect.map((row) => c.json(row, 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Category not found" }, 404)),
        ),
        Effect.catchTag("CategoryTakenError", (e) =>
          Effect.succeed(c.json(nameTakenBody(e.name), 409)),
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
          db
            .delete(schema.financeCategory)
            .where(owned(user.id, id))
            .returning({ id: schema.financeCategory.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Category not found" }, 404)
  })
