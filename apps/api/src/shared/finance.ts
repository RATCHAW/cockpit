/**
 * Finance constants shared by the API and the web app (`@cockpit/api/finance`).
 * Keep this file free of server-only imports — it ends up in the browser bundle.
 */

/** ISO 4217 codes we accept and can convert between. All are covered by the rates provider. */
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "MAD",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "KRW",
  "INR",
  "PKR",
  "BDT",
  "IDR",
  "MYR",
  "PHP",
  "THB",
  "VND",
  "AED",
  "SAR",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  "JOD",
  "ILS",
  "EGP",
  "TND",
  "DZD",
  "TRY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "UAH",
  "RUB",
  "BRL",
  "MXN",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "ZAR",
  "NGN",
  "KES",
  "GHS",
  "XOF",
  "XAF",
] as const

export type Currency = (typeof CURRENCIES)[number]

export const DEFAULT_CURRENCY: Currency = "USD"

/** Crypto an account can hold on top of `CURRENCIES`. Not ISO 4217, so never a display currency. */
export const CRYPTO_ASSETS = ["USDT", "USDC", "BTC", "ETH", "BNB", "SOL"] as const

/** Everything an account balance can be held in. The rates provider quotes all of them. */
export const ASSETS = [...CURRENCIES, ...CRYPTO_ASSETS] as const
export type Asset = (typeof ASSETS)[number]

export const ACCOUNT_TYPES = ["bank", "cash", "wallet", "crypto", "savings", "investment"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** How many months of spending a safety net should cover. */
export const SAFETY_NET_MONTHS = 6

export const TRANSACTION_KINDS = ["expense", "income"] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

export const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const CATEGORIES = {
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
} as const satisfies Record<TransactionKind, readonly string[]>
