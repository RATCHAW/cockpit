import { schema } from "@cockpit/db"
import { z } from "@hono/zod-openapi"
import { and, eq, isNotNull, lte } from "drizzle-orm"
import { Data, Effect } from "effect"

import {
  CATEGORIES,
  CURRENCIES,
  DEFAULT_CURRENCY,
  FREQUENCIES,
  TRANSACTION_KINDS,
  type Currency,
} from "../shared/finance"
import { occurrence, occurrenceIndexFrom, today, type IsoDate } from "./dates"
import { Db, type Rates } from "./services"

export class NotFoundError extends Data.TaggedError("NotFoundError")<{ entity: string }> {}

// ── Shared schemas ────────────────────────────────────────────────────────────

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error")

export const CurrencySchema = z.enum(CURRENCIES).openapi("Currency", { example: "MAD" })
export const KindSchema = z.enum(TRANSACTION_KINDS).openapi("TransactionKind")
export const FrequencySchema = z.enum(FREQUENCIES).openapi("Frequency")

export const IsoDateSchema = z.iso.date().openapi({ example: "2026-10-03" })
export const AmountSchema = z.number().positive().max(1_000_000_000_000).openapi({ example: 49.99 })
export const DescriptionSchema = z.string().trim().min(1).max(120).openapi({ example: "Netflix" })
export const CategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .openapi({ example: CATEGORIES.expense[0] })

export const IdParamSchema = z.object({ id: z.uuid() })

/** `?currency=` override for any read endpoint; falls back to the user's display currency. */
export const DisplayCurrencyQuery = z.object({ currency: CurrencySchema.optional() })

export const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
})

export const jsonContent = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
})

export const ratesUnavailable = errorResponse("Exchange rates are temporarily unavailable")
export const RATES_UNAVAILABLE = {
  error: "Exchange rates are temporarily unavailable. Try again shortly.",
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type Settings = { displayCurrency: Currency; defaultCurrency: Currency }

export const getSettings = (userId: string) =>
  Db.use((db) =>
    db.query((db) =>
      db
        .select({
          displayCurrency: schema.userSettings.displayCurrency,
          defaultCurrency: schema.userSettings.defaultCurrency,
        })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, userId)),
    ),
  ).pipe(
    Effect.map(
      ([row]): Settings =>
        (row as Settings | undefined) ?? {
          displayCurrency: DEFAULT_CURRENCY,
          defaultCurrency: DEFAULT_CURRENCY,
        },
    ),
  )

/** The currency to display amounts in: an explicit `?currency=` wins over the saved setting. */
export const resolveDisplayCurrency = (userId: string, requested: Currency | undefined) =>
  requested
    ? Effect.succeed(requested)
    : getSettings(userId).pipe(Effect.map((s) => s.displayCurrency))

// ── Conversion ────────────────────────────────────────────────────────────────

export const round = (value: number, digits = 2) => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** Converts via USD, which every rate is quoted against. */
export function convert(amount: number, from: string, to: string, rates: Rates) {
  if (from === to) return amount
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate || !toRate) throw new Error(`No exchange rate for ${from}→${to}`)
  return (amount / fromRate) * toRate
}

// ── Recurring transactions ────────────────────────────────────────────────────

/**
 * Books every occurrence of the user's active schedules that has come due, then moves each
 * schedule's `nextDate` forward. Idempotent: the (recurringId, date) unique index means
 * concurrent calls can't double-book.
 */
export const bookDueOccurrences = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* Db
    const now = today()
    const due = yield* db.query((db) =>
      db
        .select()
        .from(schema.recurringTransaction)
        .where(
          and(
            eq(schema.recurringTransaction.userId, userId),
            eq(schema.recurringTransaction.active, true),
            isNotNull(schema.recurringTransaction.nextDate),
            lte(schema.recurringTransaction.nextDate, now),
          ),
        ),
    )

    yield* Effect.forEach(
      due,
      (rule) => {
        const dates: IsoDate[] = []
        let k = occurrenceIndexFrom(rule, rule.nextDate!)
        let date = occurrence(rule, k)
        while (date <= now && (!rule.endDate || date <= rule.endDate)) {
          dates.push(date)
          date = occurrence(rule, ++k)
        }
        const nextDate = rule.endDate && date > rule.endDate ? null : date

        return db.query((db) =>
          db.transaction(async (tx) => {
            if (dates.length > 0) {
              await tx
                .insert(schema.transaction)
                .values(
                  dates.map((date) => ({
                    userId,
                    kind: rule.kind,
                    amount: rule.amount,
                    currency: rule.currency,
                    description: rule.description,
                    category: rule.category,
                    date,
                    recurringId: rule.id,
                  })),
                )
                .onConflictDoNothing()
            }
            await tx
              .update(schema.recurringTransaction)
              .set({ nextDate })
              .where(eq(schema.recurringTransaction.id, rule.id))
          }),
        )
      },
      { discard: true },
    )
  })
