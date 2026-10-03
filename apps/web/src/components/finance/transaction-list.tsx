import { Button } from "@cockpit/ui/components/button"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@cockpit/ui/components/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@cockpit/ui/components/tooltip"
import { cn } from "@cockpit/ui/lib/utils"
import { ArrowDownLeftIcon, ArrowUpRightIcon, RepeatIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { formatDay, formatMoney, type Transaction } from "~/lib/finance"

const PAGE = 30
type Filter = "all" | Transaction["kind"]

export function TransactionList({
  items,
  currency,
  onSelect,
  onAdd,
}: {
  items: Transaction[] | undefined
  currency: string
  onSelect: (transaction: Transaction) => void
  onAdd: () => void
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(
    () => (items ?? []).filter((t) => filter === "all" || t.kind === filter),
    [items, filter],
  )
  const days = useMemo(() => groupByDay(filtered.slice(0, limit)), [filtered, limit])

  return (
    <section
      className="grid content-start gap-5 rounded-xl bg-canvas p-6"
      aria-labelledby="transactions-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="transactions-title" className="text-display-xs">
          Transactions
        </h2>
        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value as Filter)
            setLimit(PAGE)
          }}
        >
          <TabsList className="h-10" aria-label="Show">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="expense">Spending</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {!items ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 bg-canvas-soft" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid justify-items-start gap-4 rounded-lg bg-canvas-soft p-6">
          <p className="text-body-md text-body">Nothing in this period yet.</p>
          <Button variant="outline" size="sm" onClick={onAdd}>
            Add a transaction
          </Button>
        </div>
      ) : (
        <div className="grid gap-5">
          {days.map(([day, transactions]) => (
            <div key={day} className="grid gap-1">
              <h3 className="text-caption font-semibold tracking-wide text-mute uppercase">
                {formatDay(day)}
              </h3>
              <ul className="-mx-3 grid">
                {transactions.map((t) => (
                  <li key={t.id}>
                    <TransactionRow transaction={t} currency={currency} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {filtered.length > limit ? (
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-center"
              onClick={() => setLimit((l) => l + PAGE * 2)}
            >
              Show more ({filtered.length - limit} left)
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}

function TransactionRow({
  transaction: t,
  currency,
  onSelect,
}: {
  transaction: Transaction
  currency: string
  onSelect: (transaction: Transaction) => void
}) {
  const income = t.kind === "income"
  const Icon = income ? ArrowDownLeftIcon : ArrowUpRightIcon
  return (
    <button
      type="button"
      onClick={() => onSelect(t)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          income ? "bg-wise-green-pale text-positive-deep" : "bg-canvas-soft text-ink",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-body-md font-semibold">
          <span className="truncate">{t.description}</span>
          {t.recurringId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <RepeatIcon className="size-3.5 shrink-0 text-mute" aria-label="Scheduled" />
              </TooltipTrigger>
              <TooltipContent>Booked by a schedule</TooltipContent>
            </Tooltip>
          ) : null}
        </span>
        <span className="truncate text-body-sm text-body">{t.category}</span>
      </span>
      <span className="grid shrink-0 justify-items-end">
        <span
          className={cn("text-body-md font-semibold tabular-nums", income && "text-positive-deep")}
        >
          {formatMoney(income ? t.converted : -t.converted, currency, { sign: true })}
        </span>
        {t.currency !== currency ? (
          <span className="text-body-sm text-mute tabular-nums">
            {formatMoney(t.amount, t.currency)}
          </span>
        ) : null}
      </span>
    </button>
  )
}

function groupByDay(items: Transaction[]) {
  const days = new Map<string, Transaction[]>()
  for (const t of items) {
    const list = days.get(t.date)
    if (list) list.push(t)
    else days.set(t.date, [t])
  }
  return [...days]
}
