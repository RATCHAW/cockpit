import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, desc, eq, gte, lte } from "drizzle-orm"
import { Effect } from "effect"

import {
  AmountSchema,
  bookDueOccurrences,
  CategorySchema,
  convert,
  CurrencySchema,
  DescriptionSchema,
  DisplayCurrencyQuery,
  KindSchema,
  RATES_UNAVAILABLE,
  ratesUnavailable,
  resolveDisplayCurrency,
  round,
} from "../lib/finance"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import {
  errorResponse,
  IdParamSchema,
  IsoDateSchema,
  jsonContent,
  NotFoundError,
} from "../lib/openapi"
import { Db, ExchangeRates, runtime } from "../lib/services"
import type { Currency } from "../shared/finance"

const TransactionInputSchema = z
  .object({
    kind: KindSchema,
    amount: AmountSchema,
    currency: CurrencySchema,
    description: DescriptionSchema,
    category: CategorySchema,
    date: IsoDateSchema,
  })
  .openapi("TransactionInput")

const TransactionSchema = TransactionInputSchema.extend({
  id: z.uuid(),
  /** Set when the transaction was booked by a schedule. */
  recurringId: z.uuid().nullable(),
}).openapi("Transaction")

const ConvertedTransactionSchema = TransactionSchema.extend({
  /** `amount` converted to the display currency at the rate of `date`. */
  converted: z.number(),
}).openapi("ConvertedTransaction")

const TransactionListSchema = z
  .object({ currency: CurrencySchema, items: z.array(ConvertedTransactionSchema) })
  .openapi("TransactionList")

type Row = typeof schema.transaction.$inferSelect

const toDto = (row: Row) => ({
  id: row.id,
  kind: row.kind,
  amount: row.amount,
  currency: row.currency as Currency,
  description: row.description,
  category: row.category,
  date: row.date,
  recurringId: row.recurringId,
})

const notFound = errorResponse("Transaction not found")

const listRoute = createRoute({
  method: "get",
  path: "/finance/transactions",
  tags: ["Finance"],
  summary: "List transactions",
  description:
    "Transactions in the period, newest first, each converted to the display currency at the " +
    "exchange rate of its date. Books any scheduled occurrences that have come due first.",
  middleware: [requireAuth] as const,
  request: {
    query: DisplayCurrencyQuery.extend({
      from: IsoDateSchema.optional(),
      to: IsoDateSchema.optional(),
    }),
  },
  responses: {
    200: jsonContent(TransactionListSchema, "Transactions in the period"),
    401: { description: "Not signed in" },
    502: ratesUnavailable,
  },
})

const createTransactionRoute = createRoute({
  method: "post",
  path: "/finance/transactions",
  tags: ["Finance"],
  summary: "Add a transaction",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: TransactionInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(TransactionSchema, "The created transaction"),
    401: { description: "Not signed in" },
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/finance/transactions/{id}",
  tags: ["Finance"],
  summary: "Update a transaction",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: {
      content: { "application/json": { schema: TransactionInputSchema.partial() } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(TransactionSchema, "The updated transaction"),
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/finance/transactions/{id}",
  tags: ["Finance"],
  summary: "Delete a transaction",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const owned = (userId: string, id: string) =>
  and(eq(schema.transaction.id, id), eq(schema.transaction.userId, userId))

export const transactionRoutes = createRouter()
  .openapi(listRoute, (c) => {
    const user = c.get("user")
    const { from, to, currency: requested } = c.req.valid("query")

    const program = Effect.gen(function* () {
      yield* bookDueOccurrences(user.id)
      const currency = yield* resolveDisplayCurrency(user.id, requested)
      const rows = yield* Db.use((db) =>
        db.query((db) =>
          db
            .select()
            .from(schema.transaction)
            .where(
              and(
                eq(schema.transaction.userId, user.id),
                from ? gte(schema.transaction.date, from) : undefined,
                to ? lte(schema.transaction.date, to) : undefined,
              ),
            )
            .orderBy(desc(schema.transaction.date), desc(schema.transaction.createdAt)),
        ),
      )
      const rates = yield* ExchangeRates.use((fx) => fx.forDates(rows.map((row) => row.date)))
      return {
        currency,
        items: rows.map((row) => ({
          ...toDto(row),
          converted: round(convert(row.amount, row.currency, currency, rates.get(row.date)!)),
        })),
      }
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((body) => c.json(body, 200)),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
  .openapi(createTransactionRoute, async (c) => {
    const user = c.get("user")
    const input = c.req.valid("json")
    const [row] = await runtime.runPromise(
      Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.transaction)
            .values({ ...input, userId: user.id })
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

    const program = Db.use((db) =>
      db.query((db) =>
        db.update(schema.transaction).set(input).where(owned(user.id, id)).returning(),
      ),
    ).pipe(
      Effect.flatMap(([row]) =>
        row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: "transaction" })),
      ),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(toDto(row), 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Transaction not found" }, 404)),
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
            .delete(schema.transaction)
            .where(owned(user.id, id))
            .returning({ id: schema.transaction.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Transaction not found" }, 404)
  })
