import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react"

import { formatMoney, type Summary } from "~/lib/finance"

export function SummaryTiles({ summary }: { summary: Summary | undefined }) {
  if (!summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl bg-canvas" />
        ))}
      </div>
    )
  }

  const { totals, currency } = summary
  const savingsRate = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : null

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Tile
        label="Income"
        icon={<ArrowDownLeftIcon className="size-4 text-positive-deep" aria-hidden />}
        value={formatMoney(totals.income, currency)}
      />
      <Tile
        label="Spending"
        icon={<ArrowUpRightIcon className="size-4 text-negative-deep" aria-hidden />}
        value={formatMoney(totals.expense, currency)}
        caption={`${totals.count} transaction${totals.count === 1 ? "" : "s"}`}
      />
      <Tile
        dark
        highlight={totals.net >= 0}
        label="Net"
        value={formatMoney(totals.net, currency, { sign: true })}
        caption={
          savingsRate === null
            ? undefined
            : savingsRate >= 0
              ? `${savingsRate}% of income kept`
              : "Spent more than came in"
        }
      />
    </div>
  )
}

function Tile({
  label,
  value,
  caption,
  icon,
  dark = false,
  highlight = false,
}: {
  label: string
  value: string
  caption?: string
  icon?: React.ReactNode
  dark?: boolean
  /** Wise green on ink, kept for good news only. */
  highlight?: boolean
}) {
  return (
    <section
      className={cn(
        "grid content-between gap-6 rounded-xl p-6",
        dark ? "bg-ink text-canvas-soft" : "bg-canvas",
      )}
    >
      <h2
        className={cn(
          "flex items-center gap-2 text-body-sm font-semibold",
          dark ? "text-canvas-soft/70" : "text-body",
        )}
      >
        {icon}
        {label}
      </h2>
      <div className="grid gap-1">
        <p
          className={cn(
            "font-display text-display-xs tabular-nums sm:text-[2rem] sm:leading-none",
            highlight && "text-primary",
          )}
        >
          {value}
        </p>
        <p className={cn("min-h-5 text-body-sm", dark ? "text-canvas-soft/70" : "text-mute")}>
          {caption}
        </p>
      </div>
    </section>
  )
}
