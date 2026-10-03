import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"

import { nextOccurrence, perMonth, today } from "../lib/dates"
import {
  AmountSchema,
  bookDueOccurrences,
  CategorySchema,
  convert,
  CurrencySchema,
  DescriptionSchema,
  DisplayCurrencyQuery,
  FrequencySchema,
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

const ScheduleFields = {
  kind: KindSchema,
  amount: AmountSchema,
  currency: CurrencySchema,
  description: DescriptionSchema,
  category: CategorySchema,
  frequency: FrequencySchema,
  /** Every `interval` × `frequency`, e.g. 3 × monthly = quarterly. */
  interval: z.number().int().min(1).max(365).default(1),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema.nullable().optional(),
}

const endsAfterStart = (v: { startDate?: string; endDate?: string | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate

const RecurringInputSchema = z
  .object(ScheduleFields)
  .refine(endsAfterStart, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .openapi("RecurringTransactionInput")

/** Timing (frequency, interval, start) is fixed once created; delete and recreate to change it. */
const RecurringUpdateSchema = z
  .object({
    kind: KindSchema,
    amount: AmountSchema,
    currency: CurrencySchema,
    description: DescriptionSchema,
    category: CategorySchema,
    endDate: IsoDateSchema.nullable(),
    /** Pausing skips occurrences; resuming picks up from the next one after today. */
    active: z.boolean(),
  })
  .partial()
  .openapi("RecurringTransactionUpdate")

const RecurringSchema = z
  .object({
    ...ScheduleFields,
    id: z.uuid(),
    interval: z.number().int(),
    endDate: IsoDateSchema.nullable(),
    /** Next occurrence that will be booked. Null once the schedule has ended. */
    nextDate: IsoDateSchema.nullable(),
    active: z.boolean(),
  })
  .openapi("RecurringTransaction")

const ConvertedRecurringSchema = RecurringSchema.extend({
  /** `amount` in the display currency at today's rate. */
  converted: z.number(),
  /** Average cost (or income) per month in the display currency. */
  monthly: z.number(),
}).openapi("ConvertedRecurringTransaction")

const RecurringListSchema = z
  .object({
    currency: CurrencySchema,
    items: z.array(ConvertedRecurringSchema),
    /** Monthly totals across active schedules, in the display currency. */
    monthly: z.object({ income: z.number(), expense: z.number() }),
  })
  .openapi("RecurringTransactionList")

type Row = typeof schema.recurringTransaction.$inferSelect

const toDto = (row: Row) => ({
  id: row.id,
  kind: row.kind,
  amount: row.amount,
  currency: row.currency as Currency,
  description: row.description,
  category: row.category,
  frequency: row.frequency,
  interval: row.interval,
  startDate: row.startDate,
  endDate: row.endDate,
  nextDate: row.nextDate,
  active: row.active,
})

const notFound = errorResponse("Schedule not found")

const listRoute = createRoute({
  method: "get",
  path: "/finance/recurring",
  tags: ["Finance"],
  summary: "List scheduled transactions",
  description: "Subscriptions, rent, salary and other schedules, ordered by next occurrence.",
  middleware: [requireAuth] as const,
  request: { query: DisplayCurrencyQuery },
  responses: {
    200: jsonContent(RecurringListSchema, "Schedules"),
    401: { description: "Not signed in" },
    502: ratesUnavailable,
  },
})

const createScheduleRoute = createRoute({
  method: "post",
  path: "/finance/recurring",
  tags: ["Finance"],
  summary: "Schedule a transaction",
  description:
    "Creates a schedule. Occurrences on or before today are booked as transactions right away; " +
    "later ones are booked as they come due.",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: RecurringInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(RecurringSchema, "The created schedule"),
    401: { description: "Not signed in" },
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/finance/recurring/{id}",
  tags: ["Finance"],
  summary: "Update or pause a schedule",
  description:
    "Changes apply to future occurrences only; booked transactions are left as they are.",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: RecurringUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(RecurringSchema, "The updated schedule"),
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/finance/recurring/{id}",
  tags: ["Finance"],
  summary: "Delete a schedule",
  description: "Stops the schedule. Transactions it already booked are kept.",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const owned = (userId: string, id: string) =>
  and(eq(schema.recurringTransaction.id, id), eq(schema.recurringTransaction.userId, userId))

export const recurringRoutes = createRouter()
  .openapi(listRoute, (c) => {
    const user = c.get("user")
    const { currency: requested } = c.req.valid("query")

    const program = Effect.gen(function* () {
      yield* bookDueOccurrences(user.id)
      const currency = yield* resolveDisplayCurrency(user.id, requested)
      const rows = yield* Db.use((db) =>
        db.query((db) =>
          db
            .select()
            .from(schema.recurringTransaction)
            .where(eq(schema.recurringTransaction.userId, user.id))
            .orderBy(
              asc(schema.recurringTransaction.nextDate),
              asc(schema.recurringTransaction.description),
            ),
        ),
      )
      const now = today()
      const rates = (yield* ExchangeRates.use((fx) => fx.forDates([now]))).get(now)!

      const monthly = { income: 0, expense: 0 }
      const items = rows.map((row) => {
        const converted = convert(row.amount, row.currency, currency, rates)
        const perMonthValue = converted * perMonth(row)
        // Ended or paused schedules don't count towards what you spend each month.
        if (row.active && row.nextDate) monthly[row.kind] += perMonthValue
        return { ...toDto(row), converted: round(converted), monthly: round(perMonthValue) }
      })
      return {
        currency,
        items,
        monthly: { income: round(monthly.income), expense: round(monthly.expense) },
      }
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((body) => c.json(body, 200)),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
  .openapi(createScheduleRoute, async (c) => {
    const user = c.get("user")
    const input = c.req.valid("json")
    const endDate = input.endDate ?? null

    const program = Effect.gen(function* () {
      const [row] = yield* Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.recurringTransaction)
            .values({ ...input, endDate, userId: user.id, nextDate: input.startDate })
            .returning(),
        ),
      )
      yield* bookDueOccurrences(user.id)
      const [fresh] = yield* Db.use((db) =>
        db.query((db) =>
          db.select().from(schema.recurringTransaction).where(owned(user.id, row!.id)),
        ),
      )
      return fresh!
    })

    return c.json(toDto(await runtime.runPromise(program)), 201)
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const input = c.req.valid("json")

    const program = Effect.gen(function* () {
      const db = yield* Db
      const [current] = yield* db.query((db) =>
        db.select().from(schema.recurringTransaction).where(owned(user.id, id)),
      )
      if (!current) return yield* Effect.fail(new NotFoundError({ entity: "schedule" }))

      const next = { ...current, ...input }
      let nextDate = current.nextDate
      const resumed = input.active === true && !current.active
      if (resumed || (input.endDate !== undefined && current.nextDate === null)) {
        // Resuming (or extending an ended schedule) continues from the next occurrence after
        // today — anything missed while paused isn't backfilled.
        nextDate = nextOccurrence(next, today())
      } else if (nextDate && next.endDate && nextDate > next.endDate) {
        nextDate = null
      }

      const [row] = yield* db.query((db) =>
        db
          .update(schema.recurringTransaction)
          .set({ ...input, nextDate })
          .where(owned(user.id, id))
          .returning(),
      )
      return row!
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((row) => c.json(toDto(row), 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Schedule not found" }, 404)),
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
            .delete(schema.recurringTransaction)
            .where(owned(user.id, id))
            .returning({ id: schema.recurringTransaction.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Schedule not found" }, 404)
  })
