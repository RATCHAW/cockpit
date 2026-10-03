import { and, eq, sql } from "drizzle-orm"
import { seed } from "drizzle-seed"

import { recurringTransaction, transaction, userSettings } from "../../schema"
import type { Seeder } from "../types"

const iso = (date: Date) => date.toISOString().slice(0, 10)
const monthsAgo = (months: number, day: number) => {
  const now = new Date()
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, day)))
}

/**
 * A year of mixed-currency demo data: salary paid in USD, life in MAD, a few EUR trips and
 * subscriptions. Schedules start a year back with `nextDate` at their start, so the API books
 * every past occurrence on the first request — the same path real schedules take.
 */
export const financesSeeder: Seeder = {
  name: "finances",
  run: async ({ db, admin }) => {
    const [existing] = await db
      .select({ id: transaction.id })
      .from(transaction)
      .where(eq(transaction.userId, admin.id))
      .limit(1)
    if (existing) {
      console.log("    already has transactions, skipping")
      return
    }

    await db
      .insert(userSettings)
      .values({ userId: admin.id, displayCurrency: "MAD", defaultCurrency: "MAD" })
      .onConflictDoNothing()

    const start = monthsAgo(11, 1)
    const schedule = (
      values: Omit<
        typeof recurringTransaction.$inferInsert,
        "userId" | "startDate" | "nextDate" | "frequency"
      > & { day: number; frequency?: "monthly" | "yearly" },
    ) => {
      const { day, frequency = "monthly", ...rest } = values
      const startDate = monthsAgo(11, day)
      return { ...rest, frequency, userId: admin.id, startDate, nextDate: startDate }
    }

    await db.insert(recurringTransaction).values([
      schedule({
        kind: "income",
        amount: 4200,
        currency: "USD",
        description: "Salary",
        category: "Salary",
        day: 28,
      }),
      schedule({
        kind: "expense",
        amount: 6500,
        currency: "MAD",
        description: "Rent",
        category: "Housing",
        day: 1,
      }),
      schedule({
        kind: "expense",
        amount: 15.49,
        currency: "USD",
        description: "Netflix",
        category: "Subscriptions",
        day: 12,
      }),
      schedule({
        kind: "expense",
        amount: 10.99,
        currency: "EUR",
        description: "Spotify",
        category: "Subscriptions",
        day: 5,
      }),
      schedule({
        kind: "expense",
        amount: 20,
        currency: "USD",
        description: "Claude Pro",
        category: "Subscriptions",
        day: 18,
      }),
      schedule({
        kind: "expense",
        amount: 350,
        currency: "MAD",
        description: "Gym",
        category: "Health",
        day: 3,
      }),
      schedule({
        kind: "expense",
        amount: 450,
        currency: "MAD",
        description: "Internet & phone",
        category: "Utilities",
        day: 8,
      }),
      schedule({
        kind: "expense",
        amount: 99,
        currency: "USD",
        description: "Domain & hosting",
        category: "Subscriptions",
        day: 20,
        frequency: "yearly",
      }),
    ])

    const expenses = [
      { description: "Marjane", category: "Groceries" },
      { description: "Carrefour Market", category: "Groceries" },
      { description: "Café", category: "Dining" },
      { description: "Restaurant", category: "Dining" },
      { description: "Glovo", category: "Dining" },
      { description: "Taxi", category: "Transport" },
      { description: "Fuel", category: "Transport" },
      { description: "Pharmacy", category: "Health" },
      { description: "Cinema", category: "Entertainment" },
      { description: "Clothes", category: "Shopping" },
      { description: "Electricity", category: "Utilities" },
    ]

    await seed(db, { transaction }, { seed: 7 }).refine((f) => ({
      transaction: {
        count: 260,
        columns: {
          userId: f.default({ defaultValue: admin.id }),
          kind: f.default({ defaultValue: "expense" }),
          amount: f.number({ minValue: 15, maxValue: 900, precision: 100 }),
          currency: f.weightedRandom([
            { weight: 0.88, value: f.default({ defaultValue: "MAD" }) },
            { weight: 0.12, value: f.default({ defaultValue: "EUR" }) },
          ]),
          description: f.valuesFromArray({ values: expenses.map((e) => e.description) }),
          category: f.default({ defaultValue: "Other" }),
          date: f.date({ minDate: start, maxDate: iso(new Date()) }),
          recurringId: f.default({ defaultValue: null }),
        },
      },
    }))

    // The random range is in dirhams; bring the occasional euro expense down to euro prices.
    await db
      .update(transaction)
      .set({ amount: sql`round(${transaction.amount} / 10, 2)` })
      .where(and(eq(transaction.userId, admin.id), eq(transaction.currency, "EUR")))

    // drizzle-seed fills columns independently; line each category up with its description.
    for (const { description, category } of expenses) {
      await db
        .update(transaction)
        .set({ category })
        .where(and(eq(transaction.userId, admin.id), eq(transaction.description, description)))
    }

    await db.insert(transaction).values([
      {
        userId: admin.id,
        kind: "income",
        amount: 1200,
        currency: "EUR",
        description: "Freelance project",
        category: "Freelance",
        date: monthsAgo(7, 14),
      },
      {
        userId: admin.id,
        kind: "income",
        amount: 800,
        currency: "USD",
        description: "Freelance project",
        category: "Freelance",
        date: monthsAgo(3, 9),
      },
      {
        userId: admin.id,
        kind: "expense",
        amount: 640,
        currency: "EUR",
        description: "Flights to Lisbon",
        category: "Travel",
        date: monthsAgo(5, 2),
      },
      {
        userId: admin.id,
        kind: "expense",
        amount: 420,
        currency: "EUR",
        description: "Hotel in Lisbon",
        category: "Travel",
        date: monthsAgo(5, 10),
      },
      {
        userId: admin.id,
        kind: "expense",
        amount: 1299,
        currency: "USD",
        description: "New laptop",
        category: "Shopping",
        date: monthsAgo(2, 21),
      },
    ])

    console.log("    8 schedules, ~265 transactions")
  },
}
