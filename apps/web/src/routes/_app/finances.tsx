import { Button } from "@cockpit/ui/components/button"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlertIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"

import { CashflowChart } from "~/components/finance/cashflow-chart"
import { CategoryBreakdown } from "~/components/finance/category-breakdown"
import { CurrencySelect } from "~/components/finance/currency-select"
import { PeriodPicker } from "~/components/finance/period-picker"
import { ScheduleList } from "~/components/finance/schedule-list"
import { SummaryTiles } from "~/components/finance/summary-tiles"
import {
  TransactionDialog,
  type TransactionDialogState,
} from "~/components/finance/transaction-dialog"
import { TransactionList } from "~/components/finance/transaction-list"
import {
  CURRENCIES,
  currencyName,
  formatDate,
  PERIODS,
  periodRange,
  recurringQueryOptions,
  settingsQueryOptions,
  summaryQueryOptions,
  transactionsQueryOptions,
  type Period,
} from "~/lib/finance"

const searchSchema = z.object({
  period: z.enum(Object.keys(PERIODS) as [Period, ...Period[]]).catch("6m"),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  /** View everything in another currency without changing the saved preference. */
  currency: z.enum(CURRENCIES).optional().catch(undefined),
})

export const Route = createFileRoute("/_app/finances")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQueryOptions),
  head: () => ({ meta: [{ title: "Finances · Cockpit" }] }),
  component: FinancesPage,
})

function FinancesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [dialog, setDialog] = useState<TransactionDialogState | null>(null)

  const settings = useQuery(settingsQueryOptions)
  const currency = search.currency ?? settings.data?.displayCurrency
  const range = { ...periodRange(search.period, search), currency }

  const summary = useQuery({ ...summaryQueryOptions(range), enabled: !!currency })
  const transactions = useQuery({ ...transactionsQueryOptions(range), enabled: !!currency })
  const recurring = useQuery({ ...recurringQueryOptions(currency), enabled: !!currency })

  const failed = summary.isError || transactions.isError || recurring.isError
  const showing = summary.data?.currency ?? currency

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <h1 className="font-display text-display-md sm:text-display-xl">Finances</h1>
          <p className="min-h-6 text-body-md text-body">
            {summary.data ? <RangeLabel from={summary.data.from} to={summary.data.to} /> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CurrencySelect
            value={showing}
            onChange={(value) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  currency: value === settings.data?.displayCurrency ? undefined : value,
                }),
                replace: true,
              })
            }
          />
          <Button onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            Add transaction
          </Button>
        </div>
      </header>

      <PeriodPicker
        period={search.period}
        from={search.period === "custom" ? range.from : undefined}
        to={search.period === "custom" ? range.to : undefined}
        onChange={({ period, from, to }) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              period,
              from: period === "custom" ? from : undefined,
              to: period === "custom" ? to : undefined,
            }),
            replace: true,
          })
        }
      />

      {failed ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-negative-bg p-4 text-body-sm font-semibold text-white"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Couldn't load your finances. Exchange rates may be briefly unavailable. Try again in a
          moment.
        </div>
      ) : null}

      <SummaryTiles summary={summary.data} />

      <section className="grid gap-6 rounded-xl bg-canvas p-6" aria-labelledby="cashflow-title">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cashflow-title" className="text-display-xs">
            Cash flow
          </h2>
          {showing ? (
            <p className="text-body-sm text-mute">
              In {currencyName(showing)}, at each day's exchange rate
            </p>
          ) : null}
        </header>
        {summary.data ? (
          <CashflowChart summary={summary.data} />
        ) : (
          <div className="h-[calc(16rem+2.25rem)] animate-pulse rounded-lg bg-canvas-soft sm:h-[calc(18rem+2.25rem)]" />
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TransactionList
          items={transactions.data?.items}
          currency={transactions.data?.currency ?? showing ?? "USD"}
          onSelect={(transaction) => setDialog({ mode: "edit", transaction })}
          onAdd={() => setDialog({ mode: "create" })}
        />
        <div className="grid gap-6">
          <ScheduleList
            data={recurring.data}
            onEdit={(schedule) => setDialog({ mode: "schedule", schedule })}
            onAdd={() => setDialog({ mode: "create", repeat: "monthly" })}
          />
          <CategoryBreakdown summary={summary.data} />
        </div>
      </div>

      <TransactionDialog
        state={dialog}
        onClose={() => setDialog(null)}
        defaultCurrency={settings.data?.defaultCurrency ?? "USD"}
      />
    </div>
  )
}

function RangeLabel({ from, to }: { from: string; to: string }) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const opts = { month: "short", day: "numeric" } as const
  return (
    <>
      {formatDate(from, { ...opts, year: sameYear ? undefined : "numeric" })} –{" "}
      {formatDate(to, { ...opts, year: "numeric" })}
    </>
  )
}
