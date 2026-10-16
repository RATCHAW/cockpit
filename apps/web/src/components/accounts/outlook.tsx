import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import type { ReactNode } from "react"

import { formatMonths, formatMoney, type NetWorth } from "~/lib/finance"

/** The answer to "what can I do with it": spend, how long it lasts, what's spare beyond a safety net. */
export function Outlook({ data }: { data: NetWorth | undefined }) {
  return (
    <section className="grid gap-6 rounded-xl bg-canvas p-6" aria-labelledby="outlook-title">
      <header className="grid gap-1">
        <h2 id="outlook-title" className="text-display-xs">
          What you can do with it
        </h2>
        {data?.outlook.monthlySpend ? (
          <p className="text-body-sm text-body">
            Based on spending about{" "}
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(data.outlook.monthlySpend, data.currency)}
            </span>{" "}
            a month
            {data.outlook.monthlySpendBasis === "history"
              ? ", your average over the last three months."
              : " in scheduled bills. Track day-to-day spending for a truer picture."}
          </p>
        ) : null}
      </header>

      {!data ? (
        <div className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 bg-canvas-soft" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-canvas-soft">
          <FreeToSpend data={data} />
          <Runway data={data} />
          <SafetyNet data={data} />
        </div>
      )}
    </section>
  )
}

function Block({
  label,
  value,
  tone,
  children,
}: {
  label: string
  value: ReactNode
  tone?: "negative"
  children: ReactNode
}) {
  return (
    <div className="grid content-start gap-2 md:px-6 md:first:pl-0 md:last:pr-0">
      <h3 className="text-body-sm font-semibold text-body">{label}</h3>
      <p
        className={cn(
          "font-display text-display-xs tabular-nums sm:text-[2rem] sm:leading-none",
          tone === "negative" && "text-negative-deep",
        )}
      >
        {value}
      </p>
      <div className="text-body-sm text-body">{children}</div>
    </div>
  )
}

const Amount = ({ value, currency }: { value: number; currency: string }) => (
  <span className="font-semibold text-ink tabular-nums">{formatMoney(value, currency)}</span>
)

function FreeToSpend({ data }: { data: NetWorth }) {
  const { outlook, totals, currency } = data
  const short = outlook.freeToSpend < 0

  return (
    <Block
      label="Free to spend"
      value={formatMoney(outlook.freeToSpend, currency)}
      tone={short ? "negative" : undefined}
    >
      <p>
        <Amount value={totals.spendable} currency={currency} /> ready to spend
        {outlook.bills > 0 ? (
          <>
            , less <Amount value={outlook.bills} currency={currency} /> in bills over the next{" "}
            {outlook.days} days.
          </>
        ) : (
          <>, with no bills scheduled in the next {outlook.days} days.</>
        )}
        {short
          ? " Move some over from what you've set aside, or hold off until income lands."
          : null}
      </p>
      {outlook.income > 0 ? (
        <p className="mt-1 text-mute">
          {formatMoney(outlook.income, currency)} more is scheduled to come in.
        </p>
      ) : null}
    </Block>
  )
}

function Runway({ data }: { data: NetWorth }) {
  const { outlook } = data
  if (outlook.runwayMonths === null) {
    return (
      <Block label="Runway" value="—">
        Add transactions or scheduled bills to see how long your money would last.
      </Block>
    )
  }
  return (
    <Block label="Runway" value={formatMonths(outlook.runwayMonths)}>
      How long everything you have would last if income stopped today.
    </Block>
  )
}

function SafetyNet({ data }: { data: NetWorth }) {
  const { safetyNet } = data.outlook
  const { currency, totals } = data
  if (!safetyNet) {
    return (
      <Block label="Safety net" value="—">
        Once you track some spending, this shows whether you have enough set by for a rough patch.
      </Block>
    )
  }

  const covered = safetyNet.beyond >= 0
  const progress =
    safetyNet.target > 0 ? Math.min(Math.max(totals.netWorth, 0) / safetyNet.target, 1) : 1

  return (
    <Block
      label={`Beyond a ${safetyNet.months}-month safety net`}
      value={formatMoney(safetyNet.beyond, currency, { sign: !covered })}
      tone={covered ? undefined : "negative"}
    >
      <div
        className="mb-3 h-2 rounded-full bg-canvas-soft"
        role="meter"
        aria-label="Safety net covered"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className={cn("h-full rounded-full", covered ? "bg-positive" : "bg-warning")}
          style={{ width: `${Math.max(progress * 100, 2)}%` }}
        />
      </div>
      {covered ? (
        <p>
          You have {safetyNet.months} months of spending (
          <Amount value={safetyNet.target} currency={currency} />) covered. The rest is room to
          invest or put toward something big.
        </p>
      ) : (
        <p>
          {Math.round(progress * 100)}% of the way to {safetyNet.months} months of spending (
          <Amount value={safetyNet.target} currency={currency} />
          ). Build this up before investing or big purchases.
        </p>
      )}
    </Block>
  )
}
