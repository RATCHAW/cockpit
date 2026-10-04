import {
  ASSETS,
  CURRENCIES,
  type AccountType,
  type Asset,
  type Currency,
  type Frequency,
  type TransactionKind,
} from "@cockpit/api/finance"
import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { parseResponse, type InferResponseType } from "hono/client"

import { api } from "./api"

export {
  ACCOUNT_TYPES,
  ASSETS,
  CATEGORIES,
  CURRENCIES,
  TRANSACTION_KINDS,
} from "@cockpit/api/finance"
export type { AccountType, Asset, Currency, Frequency, TransactionKind }

export type Summary = InferResponseType<typeof api.finance.summary.$get, 200>
export type Transaction = InferResponseType<
  typeof api.finance.transactions.$get,
  200
>["items"][number]
export type Schedule = InferResponseType<typeof api.finance.recurring.$get, 200>["items"][number]
export type Settings = InferResponseType<typeof api.settings.$get, 200>
export type AccountList = InferResponseType<typeof api.finance.accounts.$get, 200>
export type Account = AccountList["items"][number]
export type NetWorth = InferResponseType<(typeof api.finance)["net-worth"]["$get"], 200>

// ── Queries ───────────────────────────────────────────────────────────────────

type Range = { from?: string; to?: string; currency?: Currency }

/** Everything finance-related lives under this key, so one invalidation refreshes the page. */
export const financeKey = ["finance"] as const

export const summaryQueryOptions = (range: Range) =>
  queryOptions({
    queryKey: [...financeKey, "summary", range],
    queryFn: () => parseResponse(api.finance.summary.$get({ query: range })),
    placeholderData: keepPreviousData,
  })

export const transactionsQueryOptions = (range: Range) =>
  queryOptions({
    queryKey: [...financeKey, "transactions", range],
    queryFn: () => parseResponse(api.finance.transactions.$get({ query: range })),
    placeholderData: keepPreviousData,
  })

export const recurringQueryOptions = (currency?: Currency) =>
  queryOptions({
    queryKey: [...financeKey, "recurring", { currency }],
    queryFn: () => parseResponse(api.finance.recurring.$get({ query: { currency } })),
    placeholderData: keepPreviousData,
  })

export const accountsQueryOptions = (currency?: Currency) =>
  queryOptions({
    queryKey: [...financeKey, "accounts", { currency }],
    queryFn: () => parseResponse(api.finance.accounts.$get({ query: { currency } })),
    placeholderData: keepPreviousData,
  })

export const netWorthQueryOptions = (currency?: Currency) =>
  queryOptions({
    queryKey: [...financeKey, "net-worth", { currency }],
    queryFn: () => parseResponse(api.finance["net-worth"].$get({ query: { currency } })),
    placeholderData: keepPreviousData,
  })

export const settingsQueryOptions = queryOptions({
  queryKey: ["settings"],
  queryFn: () => parseResponse(api.settings.$get()),
  staleTime: 5 * 60_000,
})

// ── Formatting ────────────────────────────────────────────────────────────────

const currencyNames = new Intl.DisplayNames(undefined, { type: "currency" })
export const currencyName = (code: string) => currencyNames.of(code) ?? code

export const currencyOptions = CURRENCIES.map((code) => ({
  value: code,
  label: `${code} · ${currencyName(code)}`,
}))

const moneyFormats = new Map<string, Intl.NumberFormat>()
export function formatMoney(
  amount: number,
  currency: string,
  { compact = false, sign = false }: { compact?: boolean; sign?: boolean } = {},
) {
  const key = `${currency}|${compact}|${sign}`
  let format = moneyFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : undefined,
      signDisplay: sign ? "exceptZero" : "auto",
    })
    moneyFormats.set(key, format)
  }
  return format.format(amount)
}

const isCurrency = (code: string): code is Currency =>
  (CURRENCIES as readonly string[]).includes(code)

const STABLECOINS = new Set(["USDT", "USDC"])
const cryptoFormats = new Map<string, Intl.NumberFormat>()

/** Like `formatMoney`, but also takes crypto: "0.0421 BTC", "3,150.00 USDT". */
export function formatAsset(
  amount: number,
  asset: string,
  options: { compact?: boolean; sign?: boolean } = {},
) {
  if (isCurrency(asset)) return formatMoney(amount, asset, options)
  const digits = STABLECOINS.has(asset) ? 2 : 8
  const key = `${digits}|${options.sign}`
  let format = cryptoFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits === 2 ? 2 : 0,
      maximumFractionDigits: digits,
      signDisplay: options.sign ? "exceptZero" : "auto",
    })
    cryptoFormats.set(key, format)
  }
  return `${format.format(amount)} ${asset}`
}

export const assetOptions = ASSETS.map((code) => ({
  value: code,
  label: isCurrency(code) ? `${code} · ${currencyName(code)}` : `${code} · Crypto`,
}))

export const ACCOUNT_TYPE_LABELS = {
  bank: "Bank",
  cash: "Cash",
  wallet: "Online wallet",
  crypto: "Crypto",
  savings: "Savings",
  investment: "Investments",
} as const satisfies Record<AccountType, string>

/** Savings and investments start out set aside; everything else is spendable. */
export const spendableByDefault = (type: AccountType) => type !== "savings" && type !== "investment"

/** "3 months", "1.5 years". */
export function formatMonths(months: number) {
  if (months >= 24) return `${Math.round(months / 1.2) / 10} years`
  const rounded = months < 10 ? Math.round(months * 10) / 10 : Math.round(months)
  return `${rounded} ${rounded === 1 ? "month" : "months"}`
}

/** Parses "1 234,50" or "1,234.50" style input. Returns NaN when it isn't a number. */
export function parseAmount(input: string) {
  const cleaned = input.replace(/[\s\u00a0']/g, "")
  // A comma followed by exactly 1–2 digits at the end is a decimal separator, and so is the
  // comma in "0,0421" (crypto amounts).
  const normalized = /,\d{1,2}$|^-?0,\d+$/.test(cleaned)
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "")
  return normalized === "" ? NaN : Number(normalized)
}

const parseDate = (date: string) => new Date(`${date}T00:00:00`)

export const formatDate = (date: string, options: Intl.DateTimeFormatOptions) =>
  parseDate(date).toLocaleDateString(undefined, options)

/** "Today", "Yesterday", or "Mon, Sep 29" (with the year when it isn't this year). */
export function formatDay(date: string) {
  const today = isoDate(new Date())
  if (date === today) return "Today"
  if (date === isoDate(addDays(new Date(), -1))) return "Yesterday"
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return formatDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  })
}

export function formatPeriod(period: string, granularity: "day" | "month", long = false) {
  return granularity === "month"
    ? formatDate(`${period}-01`, {
        month: long ? "long" : "short",
        year: long ? "numeric" : undefined,
      })
    : formatDate(
        period,
        long ? { weekday: "short", month: "short", day: "numeric" } : { day: "numeric" },
      )
}

// ── Repeat options ────────────────────────────────────────────────────────────

export const REPEATS = {
  none: { label: "Doesn't repeat" },
  daily: { label: "Every day", frequency: "daily", interval: 1 },
  weekly: { label: "Every week", frequency: "weekly", interval: 1 },
  monthly: { label: "Every month", frequency: "monthly", interval: 1 },
  quarterly: { label: "Every 3 months", frequency: "monthly", interval: 3 },
  yearly: { label: "Every year", frequency: "yearly", interval: 1 },
} as const satisfies Record<string, { label: string; frequency?: Frequency; interval?: number }>

export type Repeat = keyof typeof REPEATS

export function describeSchedule({
  frequency,
  interval,
}: {
  frequency: Frequency
  interval: number
}) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[frequency]
  if (interval === 1)
    return { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[frequency]
  if (frequency === "monthly" && interval === 3) return "Quarterly"
  return `Every ${interval} ${unit}s`
}

// ── Periods ───────────────────────────────────────────────────────────────────

export const isoDate = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const firstOfMonth = (monthsBack: number, from = new Date()) =>
  isoDate(new Date(from.getFullYear(), from.getMonth() - monthsBack, 1))

export const PERIODS = {
  month: { label: "This month" },
  "3m": { label: "3 months" },
  "6m": { label: "6 months" },
  "12m": { label: "12 months" },
  ytd: { label: "This year" },
  all: { label: "All time" },
  custom: { label: "Custom" },
} as const

export type Period = keyof typeof PERIODS

/** Calendar-aligned ranges: "6 months" is this month plus the five before it. */
export function periodRange(period: Period, custom: { from?: string; to?: string } = {}) {
  const now = new Date()
  const today = isoDate(now)
  switch (period) {
    case "month":
      return { from: firstOfMonth(0), to: today }
    case "3m":
      return { from: firstOfMonth(2), to: today }
    case "6m":
      return { from: firstOfMonth(5), to: today }
    case "12m":
      return { from: firstOfMonth(11), to: today }
    case "ytd":
      return { from: `${now.getFullYear()}-01-01`, to: today }
    case "all":
      return { from: undefined, to: today }
    case "custom":
      return { from: custom.from ?? firstOfMonth(0), to: custom.to ?? today }
  }
}
