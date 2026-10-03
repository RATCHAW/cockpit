import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"

import { CardHeader } from "~/components/overview/card-header"
import { formatDate, formatMoney, type Schedule, type Summary } from "~/lib/finance"
import { addDays, relativeDays } from "~/lib/projects"

/** Spending, income and net for the month so far. */
export function MonthMoney({
  summary,
  failed,
  today,
}: {
  summary: Summary | undefined
  failed: boolean
  today: string
}) {
  const month = formatDate(today, { month: "long" })

  return (
    <section
      className="grid content-start gap-6 rounded-xl bg-ink p-6 text-canvas-soft"
      aria-labelledby="month-title"
    >
      <CardHeader
        id="month-title"
        title={`${month} so far`}
        to="/finances"
        linkLabel="Open finances"
        dark
      />

      {failed ? (
        <p className="text-body-sm text-canvas-soft/70">
          Couldn't load this month. Exchange rates may be briefly unavailable.
        </p>
      ) : !summary ? (
        <div className="grid gap-3">
          <Skeleton className="h-10 w-48 bg-canvas-soft/10" />
          <Skeleton className="h-5 w-64 bg-canvas-soft/10" />
        </div>
      ) : summary.totals.count === 0 ? (
        <p className="text-body-sm text-canvas-soft/70">
          No transactions yet this month. Scheduled ones book themselves when they come due.
        </p>
      ) : (
        <MonthFigures summary={summary} />
      )}
    </section>
  )
}

function MonthFigures({ summary }: { summary: Summary }) {
  const { totals, currency, categories } = summary
  const top = categories[0]

  return (
    <>
      <div className="grid gap-1">
        <p className="font-display text-display-md tabular-nums">
          {formatMoney(totals.expense, currency)}
        </p>
        <p className="text-body-sm text-canvas-soft/70">
          spent
          {top
            ? `, most of it on ${top.category} (${formatMoney(top.amount, currency, { compact: true })})`
            : null}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-t border-canvas-soft/15 pt-4">
        <div className="grid gap-1">
          <dt className="text-body-sm text-canvas-soft/70">Came in</dt>
          <dd className="text-body-md font-semibold tabular-nums">
            {formatMoney(totals.income, currency)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-body-sm text-canvas-soft/70">Net</dt>
          {/* Wise green on ink, kept for good news only. */}
          <dd
            className={cn(
              "text-body-md font-semibold tabular-nums",
              totals.net >= 0 && "text-primary",
            )}
          >
            {formatMoney(totals.net, currency, { sign: true })}
          </dd>
        </div>
      </dl>
    </>
  )
}

/** How far ahead scheduled transactions show up. */
const BILLS_DAYS = 14

/** Scheduled transactions due in the next two weeks. Hidden when nothing is scheduled at all. */
export function UpcomingBills({
  data,
  today,
}: {
  data: { currency: string; items: Schedule[] } | undefined
  today: string
}) {
  if (!data || data.items.length === 0) return null

  const until = addDays(today, BILLS_DAYS)
  const due = data.items
    .filter((s) => s.active && s.nextDate !== null && s.nextDate <= until)
    .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!))
  const out = due.filter((s) => s.kind === "expense").reduce((sum, s) => sum + s.converted, 0)

  return (
    <section
      className="grid content-start gap-4 rounded-xl bg-canvas-soft p-6"
      aria-labelledby="bills-title"
    >
      <CardHeader
        id="bills-title"
        title="Next two weeks"
        caption={
          out > 0 ? (
            <>
              <span className="font-semibold text-ink tabular-nums">
                {formatMoney(out, data.currency)}
              </span>{" "}
              in scheduled payments
            </>
          ) : undefined
        }
        to="/finances"
        linkLabel="Open finances"
      />
      {due.length === 0 ? (
        <p className="rounded-lg bg-canvas p-4 text-body-sm text-body">
          Nothing scheduled before{" "}
          {formatDate(until, { weekday: "long", month: "short", day: "numeric" })}.
        </p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {due.map((s) => {
            const income = s.kind === "income"
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-lg bg-canvas px-4 py-3">
                <div className="grid min-w-0 flex-1">
                  <span className="truncate text-body-sm font-semibold">{s.description}</span>
                  <span className="truncate text-body-sm text-body">
                    {formatDate(s.nextDate!, { weekday: "short", month: "short", day: "numeric" })}
                    {" · "}
                    {relativeDays(s.nextDate!, today)}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-body-sm font-semibold tabular-nums",
                    income && "text-positive-deep",
                  )}
                >
                  {formatMoney(income ? s.converted : -s.converted, data.currency, { sign: true })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
