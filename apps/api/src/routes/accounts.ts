import { schema } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm"
import { Effect } from "effect"

import {
  addDays,
  addMonths,
  monthOf,
  occurrence,
  occurrenceIndexFrom,
  perMonth,
  today,
  type IsoDate,
} from "../lib/dates"
import {
  AccountTypeSchema,
  AssetSchema,
  bookDueOccurrences,
  convert,
  CurrencySchema,
  DisplayCurrencyQuery,
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
import { SAFETY_NET_MONTHS, type Asset } from "../shared/finance"

/** How far ahead scheduled bills and income count towards what's free to spend. */
const OUTLOOK_DAYS = 30
/** Full months of spending averaged into "what you usually spend". */
const SPENDING_MONTHS = 3
/** Points on the net-worth chart, one per month. */
const HISTORY_MONTHS = 24

const NameSchema = z.string().trim().min(1).max(60).openapi({ example: "Binance" })
/** Negative for debts (a credit card, money you owe). */
const BalanceSchema = z
  .number()
  .min(-1_000_000_000_000)
  .max(1_000_000_000_000)
  .openapi({ example: 1250.5 })
/** Balances are as of a day; a little slack lets a client a timezone ahead say "today". */
const BalanceDateSchema = IsoDateSchema.refine((date) => date <= addDays(today(), 1), {
  message: "Balance date can't be in the future",
})

const AccountInputSchema = z
  .object({
    name: NameSchema,
    type: AccountTypeSchema,
    currency: AssetSchema,
    spendable: z.boolean().default(true),
    balance: BalanceSchema,
    /** Day the balance is from. Defaults to today. */
    date: BalanceDateSchema.optional(),
  })
  .openapi("AccountInput")

/** The currency is fixed once created: past balances are in it. */
const AccountUpdateSchema = z
  .object({ name: NameSchema, type: AccountTypeSchema, spendable: z.boolean() })
  .partial()
  .openapi("AccountUpdate")

const BalanceInputSchema = z
  .object({ amount: BalanceSchema, date: BalanceDateSchema.optional() })
  .openapi("BalanceInput")

const AccountSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: AccountTypeSchema,
    currency: AssetSchema,
    spendable: z.boolean(),
    balance: z.number(),
    /** Day of the latest balance. */
    updatedOn: IsoDateSchema,
  })
  .openapi("Account")

const ConvertedAccountSchema = AccountSchema.extend({
  /** `balance` in the display currency at today's rate. */
  converted: z.number(),
}).openapi("ConvertedAccount")

const TotalsSchema = z.object({
  netWorth: z.number(),
  /** Accounts marked spendable. */
  spendable: z.number(),
  /** Savings and investments you've set aside. */
  setAside: z.number(),
})

const AccountListSchema = z
  .object({
    currency: CurrencySchema,
    /** Largest balance first. */
    items: z.array(ConvertedAccountSchema),
    totals: TotalsSchema,
    /** How much is held in each currency, largest first. */
    byCurrency: z.array(
      z.object({ currency: AssetSchema, amount: z.number(), converted: z.number() }),
    ),
  })
  .openapi("AccountList")

const NetWorthSchema = z
  .object({
    currency: CurrencySchema,
    totals: TotalsSchema,
    /** Net worth at the end of each month, the current month as of today. */
    history: z.array(z.object({ date: IsoDateSchema, total: z.number() })),
    outlook: z.object({
      /** Days ahead that `bills` and `income` cover. */
      days: z.number().int(),
      bills: z.number(),
      income: z.number(),
      /** Spendable money left once the scheduled bills are paid. */
      freeToSpend: z.number(),
      /** Average monthly spending, or null with nothing to go on yet. */
      monthlySpend: z.number().nullable(),
      /** `history`: last few full months of transactions. `schedules`: recurring bills only. */
      monthlySpendBasis: z.enum(["history", "schedules"]).nullable(),
      /** Months your net worth would last at `monthlySpend` with no income. */
      runwayMonths: z.number().nullable(),
      safetyNet: z
        .object({
          months: z.number().int(),
          target: z.number(),
          /** Net worth past the target: room to invest or spend on something big. Negative if short. */
          beyond: z.number(),
        })
        .nullable(),
    }),
  })
  .openapi("NetWorth")

type AccountRow = typeof schema.financeAccount.$inferSelect

const toDto = (row: AccountRow, latest: { amount: number; date: IsoDate }) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  currency: row.currency as Asset,
  spendable: row.spendable,
  balance: latest.amount,
  updatedOn: latest.date,
})

const notFound = errorResponse("Account not found")

const owned = (userId: string, id: string) =>
  and(eq(schema.financeAccount.id, id), eq(schema.financeAccount.userId, userId))

/** Every account with its latest balance, oldest account first. */
const loadAccounts = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* Db
    const accounts = yield* db.query((db) =>
      db
        .select()
        .from(schema.financeAccount)
        .where(eq(schema.financeAccount.userId, userId))
        .orderBy(asc(schema.financeAccount.createdAt)),
    )
    if (accounts.length === 0) return []
    const latest = yield* db.query((db) =>
      db
        .selectDistinctOn([schema.balanceSnapshot.accountId], {
          accountId: schema.balanceSnapshot.accountId,
          amount: schema.balanceSnapshot.amount,
          date: schema.balanceSnapshot.date,
        })
        .from(schema.balanceSnapshot)
        .where(
          inArray(
            schema.balanceSnapshot.accountId,
            accounts.map((a) => a.id),
          ),
        )
        .orderBy(schema.balanceSnapshot.accountId, desc(schema.balanceSnapshot.date)),
    )
    const byAccount = new Map(latest.map((row) => [row.accountId, row]))
    // Every account is created with a balance, so a snapshot always exists.
    return accounts.map((row) => toDto(row, byAccount.get(row.id)!))
  })

type Account = ReturnType<typeof toDto>

const findAccount = (userId: string, id: string) =>
  Effect.gen(function* () {
    const accounts = yield* loadAccounts(userId)
    const account = accounts.find((a) => a.id === id)
    if (!account) return yield* Effect.fail(new NotFoundError({ entity: "account" }))
    return account
  })

function totalsOf(accounts: Array<Account & { converted: number }>) {
  let spendable = 0
  let setAside = 0
  for (const a of accounts) {
    if (a.spendable) spendable += a.converted
    else setAside += a.converted
  }
  return {
    netWorth: round(spendable + setAside),
    spendable: round(spendable),
    setAside: round(setAside),
  }
}

/** Accounts converted to `currency` at today's rates, largest first. */
const convertedAccounts = (userId: string, currency: string) =>
  Effect.gen(function* () {
    const accounts = yield* loadAccounts(userId)
    const now = today()
    const rates = (yield* ExchangeRates.use((fx) => fx.forDates([now]))).get(now)!
    return accounts
      .map((a) => ({ ...a, converted: round(convert(a.balance, a.currency, currency, rates)) }))
      .sort((a, b) => b.converted - a.converted)
  })

/** End of each month from the first balance (at most `HISTORY_MONTHS` back) up to today. */
function historyDates(first: IsoDate, now: IsoDate) {
  const thisMonth = `${monthOf(now)}-01`
  let month = `${monthOf(first)}-01`
  const earliest = addMonths(thisMonth, -(HISTORY_MONTHS - 1))
  if (month < earliest) month = earliest
  const dates: IsoDate[] = []
  for (; month < thisMonth; month = addMonths(month, 1)) {
    dates.push(addDays(addMonths(month, 1), -1))
  }
  dates.push(now)
  return dates
}

const netWorthHistory = (userId: string, currency: string) =>
  Effect.gen(function* () {
    const snapshots = yield* Db.use((db) =>
      db.query((db) =>
        db
          .select({
            accountId: schema.balanceSnapshot.accountId,
            currency: schema.financeAccount.currency,
            date: schema.balanceSnapshot.date,
            amount: schema.balanceSnapshot.amount,
          })
          .from(schema.balanceSnapshot)
          .innerJoin(
            schema.financeAccount,
            eq(schema.balanceSnapshot.accountId, schema.financeAccount.id),
          )
          .where(eq(schema.financeAccount.userId, userId))
          .orderBy(asc(schema.balanceSnapshot.date)),
      ),
    )
    if (snapshots.length === 0) return []

    const dates = historyDates(snapshots[0]!.date, today())
    const rates = yield* ExchangeRates.use((fx) => fx.forDates(dates))

    // Walk the snapshots in date order once, carrying each account's latest balance forward.
    const current = new Map<string, { amount: number; currency: string }>()
    let next = 0
    return dates.map((date) => {
      while (next < snapshots.length && snapshots[next]!.date <= date) {
        const s = snapshots[next++]!
        current.set(s.accountId, s)
      }
      let total = 0
      for (const { amount, currency: from } of current.values()) {
        total += convert(amount, from, currency, rates.get(date)!)
      }
      return { date, total: round(total) }
    })
  })

/** Scheduled bills and income over the next `OUTLOOK_DAYS`, plus their monthly cost. */
const scheduledOutlook = (userId: string, currency: string) =>
  Effect.gen(function* () {
    const rules = yield* Db.use((db) =>
      db.query((db) =>
        db
          .select()
          .from(schema.recurringTransaction)
          .where(
            and(
              eq(schema.recurringTransaction.userId, userId),
              eq(schema.recurringTransaction.active, true),
            ),
          ),
      ),
    )
    const now = today()
    const horizon = addDays(now, OUTLOOK_DAYS)
    const rates = (yield* ExchangeRates.use((fx) => fx.forDates([now]))).get(now)!

    const upcoming = { income: 0, expense: 0 }
    let monthlyBills = 0
    for (const rule of rules) {
      if (!rule.nextDate) continue
      const value = convert(rule.amount, rule.currency, currency, rates)
      if (rule.kind === "expense") monthlyBills += value * perMonth(rule)
      let k = occurrenceIndexFrom(rule, rule.nextDate)
      for (
        let date = occurrence(rule, k);
        date <= horizon && (!rule.endDate || date <= rule.endDate);
        date = occurrence(rule, ++k)
      ) {
        upcoming[rule.kind] += value
      }
    }
    return { ...upcoming, monthlyBills }
  })

/** Average spending over the last `SPENDING_MONTHS` full months that had any. */
const averageMonthlySpend = (userId: string, currency: string) =>
  Effect.gen(function* () {
    const thisMonth = `${monthOf(today())}-01`
    const rows = yield* Db.use((db) =>
      db.query((db) =>
        db
          .select({
            amount: schema.transaction.amount,
            currency: schema.transaction.currency,
            date: schema.transaction.date,
          })
          .from(schema.transaction)
          .where(
            and(
              eq(schema.transaction.userId, userId),
              eq(schema.transaction.kind, "expense"),
              gte(schema.transaction.date, addMonths(thisMonth, -SPENDING_MONTHS)),
              lt(schema.transaction.date, thisMonth),
            ),
          ),
      ),
    )
    if (rows.length === 0) return null
    const rates = yield* ExchangeRates.use((fx) => fx.forDates(rows.map((row) => row.date)))
    let total = 0
    for (const row of rows)
      total += convert(row.amount, row.currency, currency, rates.get(row.date)!)
    // Months you weren't tracking yet shouldn't drag the average down.
    return total / new Set(rows.map((row) => monthOf(row.date))).size
  })

const listRoute = createRoute({
  method: "get",
  path: "/finance/accounts",
  tags: ["Accounts"],
  summary: "List accounts",
  description:
    "Every place you keep money, with its latest balance converted to the display currency at " +
    "today's rate.",
  middleware: [requireAuth] as const,
  request: { query: DisplayCurrencyQuery },
  responses: {
    200: jsonContent(AccountListSchema, "Accounts and totals"),
    401: { description: "Not signed in" },
    502: ratesUnavailable,
  },
})

const netWorthRoute = createRoute({
  method: "get",
  path: "/finance/net-worth",
  tags: ["Accounts"],
  summary: "Net worth and what you can do with it",
  description:
    "Net worth over time, plus an outlook: what's free to spend after the next month's " +
    "scheduled bills, how many months your money would last, and how it compares to a " +
    `${SAFETY_NET_MONTHS}-month safety net.`,
  middleware: [requireAuth] as const,
  request: { query: DisplayCurrencyQuery },
  responses: {
    200: jsonContent(NetWorthSchema, "Net worth"),
    401: { description: "Not signed in" },
    502: ratesUnavailable,
  },
})

const createAccountRoute = createRoute({
  method: "post",
  path: "/finance/accounts",
  tags: ["Accounts"],
  summary: "Add an account",
  middleware: [requireAuth] as const,
  request: {
    body: { content: { "application/json": { schema: AccountInputSchema } }, required: true },
  },
  responses: {
    201: jsonContent(AccountSchema, "The created account"),
    401: { description: "Not signed in" },
  },
})

const updateRoute = createRoute({
  method: "patch",
  path: "/finance/accounts/{id}",
  tags: ["Accounts"],
  summary: "Rename or recategorize an account",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: AccountUpdateSchema } }, required: true },
  },
  responses: {
    200: jsonContent(AccountSchema, "The updated account"),
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const balanceRoute = createRoute({
  method: "put",
  path: "/finance/accounts/{id}/balance",
  tags: ["Accounts"],
  summary: "Record a balance",
  description:
    "Sets the account's balance as of `date` (default today), replacing any balance already " +
    "recorded that day. Earlier balances are kept for the net-worth history.",
  middleware: [requireAuth] as const,
  request: {
    params: IdParamSchema,
    body: { content: { "application/json": { schema: BalanceInputSchema } }, required: true },
  },
  responses: {
    200: jsonContent(AccountSchema, "The account with its latest balance"),
    401: { description: "Not signed in" },
    404: notFound,
  },
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/finance/accounts/{id}",
  tags: ["Accounts"],
  summary: "Delete an account",
  description: "Deletes the account and its balance history.",
  middleware: [requireAuth] as const,
  request: { params: IdParamSchema },
  responses: {
    204: { description: "Deleted" },
    401: { description: "Not signed in" },
    404: notFound,
  },
})

export const accountRoutes = createRouter()
  .openapi(listRoute, (c) => {
    const user = c.get("user")
    const { currency: requested } = c.req.valid("query")

    const program = Effect.gen(function* () {
      const currency = yield* resolveDisplayCurrency(user.id, requested)
      const items = yield* convertedAccounts(user.id, currency)

      const byCurrency = new Map<Asset, { amount: number; converted: number }>()
      for (const a of items) {
        const entry = byCurrency.get(a.currency) ?? { amount: 0, converted: 0 }
        entry.amount += a.balance
        entry.converted += a.converted
        byCurrency.set(a.currency, entry)
      }

      return {
        currency,
        items,
        totals: totalsOf(items),
        byCurrency: [...byCurrency]
          .map(([code, e]) => ({
            currency: code,
            amount: round(e.amount, 10),
            converted: round(e.converted),
          }))
          .sort((a, b) => b.converted - a.converted),
      }
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((body) => c.json(body, 200)),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
  .openapi(netWorthRoute, (c) => {
    const user = c.get("user")
    const { currency: requested } = c.req.valid("query")

    const program = Effect.gen(function* () {
      // Bills that came due are booked first, so they don't count as both spent and upcoming.
      yield* bookDueOccurrences(user.id)
      const currency = yield* resolveDisplayCurrency(user.id, requested)
      const [accounts, history, scheduled, spent] = yield* Effect.all(
        [
          convertedAccounts(user.id, currency),
          netWorthHistory(user.id, currency),
          scheduledOutlook(user.id, currency),
          averageMonthlySpend(user.id, currency),
        ],
        { concurrency: "unbounded" },
      )

      const totals = totalsOf(accounts)
      const monthlySpend = spent ?? (scheduled.monthlyBills > 0 ? scheduled.monthlyBills : null)
      const target = monthlySpend === null ? null : monthlySpend * SAFETY_NET_MONTHS

      return {
        currency,
        totals,
        history,
        outlook: {
          days: OUTLOOK_DAYS,
          bills: round(scheduled.expense),
          income: round(scheduled.income),
          freeToSpend: round(totals.spendable - scheduled.expense),
          monthlySpend: monthlySpend === null ? null : round(monthlySpend),
          monthlySpendBasis:
            spent !== null ? "history" : monthlySpend !== null ? "schedules" : null,
          runwayMonths:
            monthlySpend === null ? null : round(Math.max(totals.netWorth, 0) / monthlySpend, 1),
          safetyNet:
            target === null
              ? null
              : {
                  months: SAFETY_NET_MONTHS,
                  target: round(target),
                  beyond: round(totals.netWorth - target),
                },
        },
      } as const
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((body) => c.json(body, 200)),
        Effect.catchTag("RatesError", () => Effect.succeed(c.json(RATES_UNAVAILABLE, 502))),
      ),
    )
  })
  .openapi(createAccountRoute, async (c) => {
    const user = c.get("user")
    const { balance, date = today(), ...input } = c.req.valid("json")

    const program = Effect.gen(function* () {
      const db = yield* Db
      return yield* db.query((db) =>
        db.transaction(async (tx) => {
          const [row] = await tx
            .insert(schema.financeAccount)
            .values({ ...input, userId: user.id })
            .returning()
          await tx
            .insert(schema.balanceSnapshot)
            .values({ accountId: row!.id, date, amount: balance })
          return toDto(row!, { amount: balance, date })
        }),
      )
    })

    return c.json(await runtime.runPromise(program), 201)
  })
  .openapi(updateRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const input = c.req.valid("json")

    const program = Effect.gen(function* () {
      if (Object.keys(input).length > 0) {
        yield* Db.use((db) =>
          db.query((db) => db.update(schema.financeAccount).set(input).where(owned(user.id, id))),
        )
      }
      return yield* findAccount(user.id, id)
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((account) => c.json(account, 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Account not found" }, 404)),
        ),
      ),
    )
  })
  .openapi(balanceRoute, (c) => {
    const user = c.get("user")
    const { id } = c.req.valid("param")
    const { amount, date = today() } = c.req.valid("json")

    const program = Effect.gen(function* () {
      yield* findAccount(user.id, id)
      yield* Db.use((db) =>
        db.query((db) =>
          db
            .insert(schema.balanceSnapshot)
            .values({ accountId: id, date, amount })
            .onConflictDoUpdate({
              target: [schema.balanceSnapshot.accountId, schema.balanceSnapshot.date],
              set: { amount },
            }),
        ),
      )
      return yield* findAccount(user.id, id)
    })

    return runtime.runPromise(
      program.pipe(
        Effect.map((account) => c.json(account, 200)),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed(c.json({ error: "Account not found" }, 404)),
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
            .delete(schema.financeAccount)
            .where(owned(user.id, id))
            .returning({ id: schema.financeAccount.id }),
        ),
      ),
    )
    return deleted.length > 0 ? c.body(null, 204) : c.json({ error: "Account not found" }, 404)
  })
