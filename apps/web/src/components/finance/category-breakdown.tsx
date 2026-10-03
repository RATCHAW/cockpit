import { formatMoney, type Summary } from "~/lib/finance"

const TOP = 6

/** Where the money went: a bar list, since the job is comparing magnitudes, not parts of a pie. */
export function CategoryBreakdown({ summary }: { summary: Summary | undefined }) {
  if (!summary || summary.categories.length === 0) return null

  const { categories, currency, totals } = summary
  const top = categories.slice(0, TOP)
  const rest = categories.slice(TOP).reduce((sum, c) => sum + c.amount, 0)
  const rows = rest > 0 ? [...top, { category: "Everything else", amount: rest }] : top
  const max = Math.max(...rows.map((r) => r.amount))

  return (
    <section
      className="grid content-start gap-5 rounded-xl bg-canvas p-6"
      aria-labelledby="categories-title"
    >
      <h2 id="categories-title" className="text-display-xs">
        Where it went
      </h2>
      <ul className="grid gap-4">
        {rows.map(({ category, amount }) => (
          <li key={category} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="truncate font-semibold">{category}</span>
              <span className="shrink-0 text-body tabular-nums">
                {formatMoney(amount, currency)}
                <span className="ml-2 inline-block w-9 text-right text-mute">
                  {Math.round((amount / totals.expense) * 100)}%
                </span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-canvas-soft">
              <div
                className="h-full rounded-full bg-chart-expense"
                style={{ width: `${Math.max((amount / max) * 100, 2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
