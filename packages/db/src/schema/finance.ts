import { relations, sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
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
export const accountType = pgEnum("account_type", [
  "bank",
  "cash",
  "wallet",
  "crypto",
  "savings",
  "investment",
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
    /** Account each booked occurrence is paid from or into. */
    accountId: uuid().references(() => financeAccount.id, { onDelete: "set null" }),
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
    /**
     * Where the money came out of or went into. Null for transactions logged before accounts
     * existed, or whose account was deleted.
     */
    accountId: uuid().references(() => financeAccount.id, { onDelete: "set null" }),
    recurringId: uuid().references(() => recurringTransaction.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.date),
    index().on(t.accountId, t.date),
    // A schedule books each occurrence at most once.
    uniqueIndex().on(t.recurringId, t.date),
  ],
)

/**
 * Transactions and schedules store the name itself, not a reference: renaming a category rewrites
 * them, removing one leaves them as they are.
 */
export const financeCategory = pgTable(
  "finance_category",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: transactionKind().notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("finance_category_user_id_kind_name_index").on(
      t.userId,
      t.kind,
      sql`lower(${t.name})`,
    ),
  ],
)

/**
 * Daily FX snapshot: units of each currency per 1 USD. Rows only change to fill in codes that
 * were added after the day was first cached (crypto, for example).
 */
export const exchangeRate = pgTable("exchange_rate", {
  date: date({ mode: "string" }).primaryKey(),
  rates: jsonb().$type<Record<string, number>>().notNull(),
  fetchedAt: timestamp().defaultNow().notNull(),
})

/**
 * Somewhere money is kept: a bank account, a Binance wallet, cash in a drawer. Holds a single
 * currency (or crypto asset); its balance is the latest `balanceSnapshot` plus the transactions
 * on it since.
 */
export const financeAccount = pgTable(
  "finance_account",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: accountType().notNull(),
    /** ISO 4217 code or a crypto ticker (USDT, BTC). Fixed once created. */
    currency: text().notNull(),
    /** Money you'd spend day to day, as opposed to savings and investments you've set aside. */
    spendable: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
)

/**
 * An account's balance as you checked it on a day. Transactions on the account that come after
 * it (a later day, or the same day but logged after it) move the balance from there; earlier
 * ones are taken as already counted. Updating twice on the same day overwrites. Negative for
 * debts.
 */
export const balanceSnapshot = pgTable(
  "balance_snapshot",
  {
    accountId: uuid()
      .notNull()
      .references(() => financeAccount.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    /** Crypto needs more decimals than fiat (0.00412 BTC). */
    amount: numeric({ precision: 30, scale: 10, mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
)

export const recurringTransactionRelations = relations(recurringTransaction, ({ one, many }) => ({
  transactions: many(transaction),
  account: one(financeAccount, {
    fields: [recurringTransaction.accountId],
    references: [financeAccount.id],
  }),
}))

export const transactionRelations = relations(transaction, ({ one }) => ({
  recurring: one(recurringTransaction, {
    fields: [transaction.recurringId],
    references: [recurringTransaction.id],
  }),
  account: one(financeAccount, {
    fields: [transaction.accountId],
    references: [financeAccount.id],
  }),
}))

export const financeAccountRelations = relations(financeAccount, ({ many }) => ({
  balances: many(balanceSnapshot),
  transactions: many(transaction),
}))

export const balanceSnapshotRelations = relations(balanceSnapshot, ({ one }) => ({
  account: one(financeAccount, {
    fields: [balanceSnapshot.accountId],
    references: [financeAccount.id],
  }),
}))
