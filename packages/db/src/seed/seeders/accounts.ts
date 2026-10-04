import { eq } from "drizzle-orm"

import { balanceSnapshot, financeAccount } from "../../schema"
import type { Seeder } from "../types"

const iso = (date: Date) => date.toISOString().slice(0, 10)
const daysAgo = (days: number) => iso(new Date(Date.now() - days * 86_400_000))

/** Months of balance history per account: one balance a month, the latest a few days ago. */
const MONTHS = 11

type DemoAccount = Omit<typeof financeAccount.$inferInsert, "userId"> & {
  /** Balance today and the change per month going back, so history trends towards it. */
  balance: number
  monthly: number
  /** Days since the balance was last updated. Cash goes stale to show the reminder. */
  updated: number
}

const demo: DemoAccount[] = [
  { name: "CIH Bank", type: "bank", currency: "MAD", balance: 18_400, monthly: 900, updated: 2 },
  { name: "Cash", type: "cash", currency: "MAD", balance: 1_250, monthly: 0, updated: 45 },
  { name: "RemotePass", type: "wallet", currency: "USD", balance: 2_310, monthly: 120, updated: 5 },
  { name: "Binance", type: "crypto", currency: "USDT", balance: 3_150, monthly: 260, updated: 1 },
  {
    name: "Bitcoin",
    type: "crypto",
    currency: "BTC",
    balance: 0.042,
    monthly: 0.003,
    updated: 1,
    spendable: false,
  },
  {
    name: "Savings account",
    type: "savings",
    currency: "MAD",
    balance: 40_000,
    monthly: 2_000,
    updated: 9,
    spendable: false,
  },
]

/** Where the money sits: a bank, cash, RemotePass, Binance and some savings set aside. */
export const accountsSeeder: Seeder = {
  name: "accounts",
  run: async ({ db, admin }) => {
    const [existing] = await db
      .select({ id: financeAccount.id })
      .from(financeAccount)
      .where(eq(financeAccount.userId, admin.id))
      .limit(1)
    if (existing) {
      console.log("    already has accounts, skipping")
      return
    }

    for (const { balance, monthly, updated, ...account } of demo) {
      const [row] = await db
        .insert(financeAccount)
        .values({ ...account, userId: admin.id })
        .returning({ id: financeAccount.id })
      await db.insert(balanceSnapshot).values(
        Array.from({ length: MONTHS + 1 }, (_, i) => ({
          accountId: row!.id,
          date: daysAgo(updated + i * 30),
          amount: Math.max(balance - monthly * i, 0),
        })),
      )
    }

    console.log(`    ${demo.length} accounts with ${MONTHS + 1} months of balances`)
  },
}
