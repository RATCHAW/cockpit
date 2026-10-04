import { formatAsset, formatMoney, type AccountList } from "~/lib/finance"

/** How exposed you are to each currency: a bar list, same as "Where it went". */
export function CurrencyMix({ data }: { data: AccountList | undefined }) {
  const rows = data?.byCurrency.filter((c) => c.converted > 0) ?? []
  if (!data || rows.length < 2) return null

  const total = rows.reduce((sum, c) => sum + c.converted, 0)
  const max = Math.max(...rows.map((c) => c.converted))

  return (
    <section
      className="grid content-start gap-5 rounded-xl bg-canvas p-6"
      aria-labelledby="currencies-title"
    >
      <h2 id="currencies-title" className="text-display-xs">
        By currency
      </h2>
      <ul className="grid gap-4">
        {rows.map((c) => (
          <li key={c.currency} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="truncate">
                <span className="font-semibold">{c.currency}</span>
                {c.currency !== data.currency ? (
                  <span className="ml-2 text-mute tabular-nums">
                    {formatAsset(c.amount, c.currency)}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-body tabular-nums">
                {formatMoney(c.converted, data.currency)}
                <span className="ml-2 inline-block w-9 text-right text-mute">
                  {Math.round((c.converted / total) * 100)}%
                </span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-canvas-soft">
              <div
                className="h-full rounded-full bg-ink"
                style={{ width: `${Math.max((c.converted / max) * 100, 2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
