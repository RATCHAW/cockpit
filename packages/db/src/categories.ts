import type { Database } from "./index"
import { financeCategory, transactionKind } from "./schema"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export const DEFAULT_CATEGORIES = {
  expense: [
    "Housing",
    "Groceries",
    "Dining",
    "Transport",
    "Utilities",
    "Subscriptions",
    "Shopping",
    "Health",
    "Entertainment",
    "Travel",
    "Education",
    "Gifts",
    "Other",
  ],
  income: ["Salary", "Freelance", "Investments", "Refunds", "Gifts", "Other"],
} as const satisfies Record<(typeof transactionKind.enumValues)[number], readonly string[]>

export async function addDefaultCategories(db: Database | Transaction, userId: string) {
  await db
    .insert(financeCategory)
    .values(
      transactionKind.enumValues.flatMap((kind) =>
        DEFAULT_CATEGORIES[kind].map((name) => ({ userId, kind, name })),
      ),
    )
    .onConflictDoNothing()
}
