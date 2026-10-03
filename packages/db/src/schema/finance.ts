import { relations } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"

export const transactionKind = pgEnum("transaction_kind", ["expense", "income"])
export const recurrenceFrequency = pgEnum("recurrence_frequency", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
])

const timestamps = {
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

/** Per-user preferences. A missing row means "all defaults". */
export const userSettings = pgTable("user_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Currency every amount is converted to for display. */
  displayCurrency: text().notNull().default("USD"),
  /** Currency preselected when adding a transaction. */
  defaultCurrency: text().notNull().default("USD"),
  ...timestamps,
})

/**
 * A schedule (rent, salary, subscriptions) that produces a `transaction` on each occurrence.
 * Occurrences are anchored on `startDate` so monthly schedules keep their day of month
 * (a schedule starting Jan 31 lands on Feb 28, then Mar 31).
 */
export const recurringTransaction = pgTable(
  "recurring_transaction",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: transactionKind().notNull(),
    /** Always positive; `kind` carries the sign. */
    amount: numeric({ precision: 19, scale: 4, mode: "number" }).notNull(),
    currency: text().notNull(),
    description: text().notNull(),
    category: text().notNull(),
    frequency: recurrenceFrequency().notNull(),
    /** Every `interval` × `frequency`, e.g. 3 × monthly = quarterly. */
    interval: integer().notNull().default(1),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }),
    /** First occurrence that hasn't been booked yet. Null once the schedule has ended. */
    nextDate: date({ mode: "string" }),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
)

export const transaction = pgTable(
  "transaction",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: transactionKind().notNull(),
    /** Always positive; `kind` carries the sign. */
    amount: numeric({ precision: 19, scale: 4, mode: "number" }).notNull(),
    currency: text().notNull(),
    description: text().notNull(),
    category: text().notNull(),
    date: date({ mode: "string" }).notNull(),
    recurringId: uuid().references(() => recurringTransaction.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.date),
    // A schedule books each occurrence at most once.
    uniqueIndex().on(t.recurringId, t.date),
  ],
)

/** Daily FX snapshot: units of each currency per 1 USD. Historical rows never change. */
export const exchangeRate = pgTable("exchange_rate", {
  date: date({ mode: "string" }).primaryKey(),
  rates: jsonb().$type<Record<string, number>>().notNull(),
  fetchedAt: timestamp().defaultNow().notNull(),
})

export const recurringTransactionRelations = relations(recurringTransaction, ({ many }) => ({
  transactions: many(transaction),
}))

export const transactionRelations = relations(transaction, ({ one }) => ({
  recurring: one(recurringTransaction, {
    fields: [transaction.recurringId],
    references: [recurringTransaction.id],
  }),
}))
