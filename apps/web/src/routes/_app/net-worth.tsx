import { Button } from "@cockpit/ui/components/button"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlertIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"

import { AccountDialog, type AccountDialogState } from "~/components/accounts/account-dialog"
import { AccountList } from "~/components/accounts/account-list"
import { CurrencyMix } from "~/components/accounts/currency-mix"
import { NetWorthChart } from "~/components/accounts/net-worth-chart"
import { Outlook } from "~/components/accounts/outlook"
import { CurrencySelect } from "~/components/finance/currency-select"
import { Tile } from "~/components/finance/summary-tiles"
import {
  accountsQueryOptions,
  CURRENCIES,
  formatMoney,
  netWorthQueryOptions,
  settingsQueryOptions,
  type AccountList as AccountListData,
} from "~/lib/finance"

const searchSchema = z.object({
  /** View everything in another currency without changing the saved preference. */
  currency: z.enum(CURRENCIES).optional().catch(undefined),
})

export const Route = createFileRoute("/_app/net-worth")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQueryOptions),
  head: () => ({ meta: [{ title: "Net worth · Cockpit" }] }),
  component: NetWorthPage,
})

function NetWorthPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [dialog, setDialog] = useState<AccountDialogState | null>(null)

  const settings = useQuery(settingsQueryOptions)
  const currency = search.currency ?? settings.data?.displayCurrency
  const accounts = useQuery({ ...accountsQueryOptions(currency), enabled: !!currency })
  const netWorth = useQuery({ ...netWorthQueryOptions(currency), enabled: !!currency })

  const showing = accounts.data?.currency ?? currency
  const empty = accounts.data?.items.length === 0
  const count = accounts.data?.items.length

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <h1 className="font-display text-display-md sm:text-display-xl">Net worth</h1>
          <p className="min-h-6 text-body-md text-body">
            {count
              ? `Everything you have, across ${count} account${count === 1 ? "" : "s"}.`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CurrencySelect
            value={showing}
            onChange={(value) =>
              void navigate({
                search: {
                  currency: value === settings.data?.displayCurrency ? undefined : value,
                },
                replace: true,
              })
            }
          />
          <Button onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            Add account
          </Button>
        </div>
      </header>

      {accounts.isError || netWorth.isError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-negative-bg p-4 text-body-sm font-semibold text-white"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Couldn't load your accounts. Exchange rates may be briefly unavailable. Try again in a
          moment.
        </div>
      ) : null}

      {empty ? (
        <section className="grid justify-items-start gap-4 rounded-xl bg-canvas p-8">
          <h2 className="text-display-xs">Where's your money?</h2>
          <p className="max-w-prose text-body-md text-body">
            Add every place you keep it: your bank, cash, RemotePass, Binance. Each one can be in
            its own currency or crypto, and everything adds up here in {showing ?? "your currency"}.
            Update balances whenever you check them.
          </p>
          <Button onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            Add your first account
          </Button>
        </section>
      ) : (
        <>
          <Totals data={accounts.data} />
          <Outlook data={netWorth.data} />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <AccountList
              data={accounts.data}
              onAdd={() => setDialog({ mode: "create" })}
              onEdit={(account) => setDialog({ mode: "edit", account })}
              onUpdateBalance={(account) => setDialog({ mode: "balance", account })}
            />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
              {netWorth.data ? (
                <NetWorthChart data={netWorth.data} />
              ) : (
                <Skeleton className="h-80 rounded-xl bg-canvas" />
              )}
              <CurrencyMix data={accounts.data} />
            </div>
          </div>
        </>
      )}

      <AccountDialog
        state={dialog}
        onClose={() => setDialog(null)}
        defaultCurrency={settings.data?.defaultCurrency ?? "USD"}
      />
    </div>
  )
}

function Totals({ data }: { data: AccountListData | undefined }) {
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl bg-canvas" />
        ))}
      </div>
    )
  }

  const { totals, currency } = data
  const share = (part: number) =>
    totals.netWorth > 0 ? `${Math.round((part / totals.netWorth) * 100)}% of it` : undefined

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Tile dark label="Net worth" value={formatMoney(totals.netWorth, currency)} />
      <Tile
        label="Ready to spend"
        value={formatMoney(totals.spendable, currency)}
        caption={share(totals.spendable)}
      />
      <Tile
        label="Set aside"
        value={formatMoney(totals.setAside, currency)}
        caption={share(totals.setAside)}
      />
    </div>
  )
}
