import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, eq, gte, lte, min } from "drizzle-orm"
import { Effect } from "effect"

import { addDays, addMonths, daysBetween, monthOf, today } from "../lib/dates"
import {
  bookDueOccurrences,
  convert,
  CurrencySchema,
  DisplayCurrencyQuery,
  IsoDateSchema,
  jsonContent,
  RATES_UNAVAILABLE,
  ratesUnavailable,
  resolveDisplayCurrency,
  round,
} from "../lib/finance"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import { Db, ExchangeRates, runtime } from "../lib/services"
import { CURRENCIES, DEFAULT_CURRENCY } from "../shared/finance"

/** Ranges up to this many days are bucketed by day; longer ones by month. */
const DAILY_MAX_DAYS = 31

const TotalsSchema = z.object({ income: z.number(), expense: z.number(), net: z.number() })

const SummarySchema = z
  .object({
    currency: CurrencySchema,
    from: IsoDateSchema,
    to: IsoDateSchema,
    granularity: z.enum(["day", "month"]),
    totals: TotalsSchema.extend({ count: z.number().int() }),
    /** One bucket per day or month in the range, including empty ones. */
    series: z.array(TotalsSchema.extend({ period: z.string().openapi({ example: "2026-09" }) })),
    /** Spending per category, largest first. */
    categories: z.array(z.object({ category: z.string(), amount: z.number() })),
  })
  .openapi("FinanceSummary")

const RatesSchema = z
  .object({
    base: CurrencySchema,
    date: IsoDateSchema,
    rates: z.record(z.string(), z.number()).openapi({ example: { EUR: 0.089, USD: 0.1 } }),
  })
  .openapi("ExchangeRates")

const summaryRoute = createRoute({
  method: "get",
  path: "/finance/summary",
  tags: ["Finance"],
  summary: "Income and spending over a period",
  description:
    "Totals, a per-day or per-month series and a category breakdown, all converted to the " +
    "display currency at each transaction's own exchange rate. Omit `from` to start at your " +
    "first transaction; `to` defaults to today.",
  middleware: [requireAuth] as const,
  request: {
    query: DisplayCurrencyQuery.extend({
      from: IsoDateSchema.optional(),
      to: IsoDateSchema.optional(),
    }),
  },
  responses: {
    200: jsonContent(SummarySchema, "Summary for the period"),
    401: { description: "Not signed in" },
    502: ratesUnavailable,
  },
})

const ratesRoute = createRoute({
  method: "get",
  path: "/finance/rates",
  tags: ["Finance"],
  summary: "Exchange rates",
  description: "Units of each supported currency per 1 `base`, on `date` (default: today).",
  middleware: [requireAuth] as const,
  request: {
    query: z.object({
      base: CurrencySchema.default(DEFAULT_CURRENCY),
      date: IsoDateSchema.optional(),
    }),
  },
  responses: {
    200: jsonContent(RatesSchema, "Exchange rates"),
    401: { description: "Not signed in" },
    502: ratesUnavailable,
  },
})

function buckets(from: string, to: string, granularity: "day" | "month") {
  const periods: string[] = []
  if (granularity === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) periods.push(d)
  } else {
    const last = monthOf(to)
    for (let d = `${monthOf(from)}-01`; monthOf(d) <= last; d = addMonths(d, 1)) {
      periods.push(monthOf(d))
    }
  }
  return periods
}

export const financeRoutes = createRouter()
  .openapi(summaryRoute, (c) => {
    const user = c.get("user")
    const query = c.req.valid("query")

    const program = Effect.gen(function* () {
      yield* bookDueOccurrences(user.id)
      const currency = yield* resolveDisplayCurrency(user.id, query.currency)
      const db = yield* Db
      const owner = eq(schema.transaction.userId, user.id)

      const to = query.to ?? today()
      let from = query.from
      if (!from) {
        const [first] = yield* db.query((db) =>
          db
            .select({ date: min(schema.transaction.date) })
            .from(schema.transaction)
            .where(owner),
        )
        from = first?.date ?? to
      }
      if (from > to) from = to

      const rows = yield* db.query((db) =>
        db
          .select({
            kind: schema.transaction.kind,
            amount: schema.transaction.amount,
            currency: schema.transaction.currency,
            category: schema.transaction.category,
            date: schema.transaction.date,
          })
          .from(schema.transaction)
          .where(and(owner, gte(schema.transaction.date, from), lte(schema.transaction.date, to))),
      )
      const rates = yield* ExchangeRates.use((fx) => fx.forDates(rows.map((row) => row.date)))

      const granularity = daysBetween(from, to) < DAILY_MAX_DAYS ? "day" : "month"
      const series = new Map(
        buckets(from, to, granularity).map((period) => [period, { income: 0, expense: 0 }]),
      )
      const totals = { income: 0, expense: 0 }
      const categories = new Map<string, number>()

      for (const row of rows) {
        const value = convert(row.amount, row.currency, currency, rates.get(row.date)!)
        totals[row.kind] += value
        series.get(granularity === "day" ? row.date : monthOf(row.date))![row.kind] += value
        if (row.kind === "expense") {
          categories.set(row.category, (categories.get(row.category) ?? 0) + value)
        }
      }

      return {
        currency,
        from,
        to,
        granularity,
        totals: {
          income: round(totals.income),
          expense: round(totals.expense),
          net: round(totals.income - totals.expense),
          count: rows.length,
        },
        series: [...series].map(([period, t]) => ({
          period,
          income: round(t.income),
          expense: round(t.expense),
          net: round(t.income - t.expense),
        })),
        categories: [...categories]
          .map(([category, amount]) => ({ category, amount: round(amount) }))
          .sort((a, b) => b.amount - a.amount),
      } as const
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((body) => c.json(body, 200)),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
  .openapi(ratesRoute, (c) => {
    const { base, date = today() } = c.req.valid("query")

    const program = ExchangeRates.use((fx) => fx.forDates([date])).pipe(
      Effect.map((byDate) => {
        const usdRates = byDate.get(date)!
        const rates = Object.fromEntries(
          CURRENCIES.filter((code) => usdRates[code]).map((code) => [
            code,
            round(convert(1, base, code, usdRates), 6),
          ]),
        )
        return { base, date, rates }
      }),
    )

    return runtime.runPromise(
      program.pipe(
        Effect.map((body) => c.json(body, 200)),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
