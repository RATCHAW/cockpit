import { ChartContainer, type ChartConfig } from "@cockpit/ui/components/chart"
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"

import { formatDate, formatMoney, type NetWorth } from "~/lib/finance"

const config = {
  total: { label: "Net worth", color: "var(--color-ink)" },
} satisfies ChartConfig

type Point = NetWorth["history"][number]

/** Net worth at the end of each month. */
export function NetWorthChart({ data }: { data: NetWorth }) {
  const { history, currency } = data
  const previous = history.at(-2)
  const latest = history.at(-1)

  return (
    <section className="grid gap-5 rounded-xl bg-canvas p-6" aria-labelledby="history-title">
      <header className="grid gap-1">
        <h2 id="history-title" className="text-display-xs">
          Over time
        </h2>
        {previous && latest ? (
          <p className="text-body-sm text-body">
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(latest.total - previous.total, currency, { sign: true })}
            </span>{" "}
            since the end of {formatDate(previous.date, { month: "long" })}
          </p>
        ) : null}
      </header>

      {history.length < 2 ? (
        <p className="rounded-lg bg-canvas-soft p-4 text-body-sm text-body">
          Update your balances now and then, and this shows how your net worth moves month to month.
        </p>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <AreaChart
            data={history}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id="net-worth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={16}
              interval="preserveStartEnd"
              tickFormatter={(date: string) => formatDate(date, { month: "short" })}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={76}
              tickCount={4}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-mute)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as Point | undefined
                if (!active || !point) return null
                return (
                  <div className="grid gap-1 rounded-md bg-canvas px-3 py-2.5 text-body-sm shadow-xl ring-1 ring-ink/5">
                    <p className="text-body">
                      {formatDate(point.date, { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="font-semibold text-ink tabular-nums">
                      {formatMoney(point.total, currency)}
                    </p>
                  </div>
                )
              }}
              isAnimationActive={false}
            />
            {/* No mount animation: it redraws on every currency change and balance update. */}
            <Area
              dataKey="total"
              type="monotone"
              stroke="var(--color-total)"
              strokeWidth={2}
              fill="url(#net-worth-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  )
}
