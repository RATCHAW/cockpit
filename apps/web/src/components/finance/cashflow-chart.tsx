import { ChartContainer, type ChartConfig } from "@cockpit/ui/components/chart"
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"

import { formatMoney, formatPeriod, type Summary } from "~/lib/finance"

const config = {
  income: { label: "Income", color: "var(--color-chart-income)" },
  expense: { label: "Spending", color: "var(--color-chart-expense)" },
} satisfies ChartConfig

type Point = Summary["series"][number]

/** Income vs spending per day or month. One axis, one currency, identity via legend + tooltip. */
export function CashflowChart({ summary }: { summary: Summary }) {
  const { series, granularity, currency } = summary
  const dense = series.length > 16

  return (
    <div className="grid gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm text-body" aria-label="Legend">
        {(["income", "expense"] as const).map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-xs"
              style={{ background: config[key].color }}
              aria-hidden
            />
            {config[key].label}
          </li>
        ))}
      </ul>
      <ChartContainer config={config} className="aspect-auto h-64 w-full sm:h-72">
        <BarChart
          data={series}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barGap={2}
          barCategoryGap={dense ? "20%" : "28%"}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={8}
            interval="preserveStartEnd"
            tickFormatter={(period: string) => formatPeriod(period, granularity)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tickCount={5}
            tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "var(--color-canvas-soft)" }}
            content={({ active, payload }) => (
              <CashflowTooltip
                active={active}
                point={payload?.[0]?.payload as Point | undefined}
                granularity={granularity}
                currency={currency}
              />
            )}
            isAnimationActive={false}
          />
          {/* No mount animation: this chart redraws on every period/currency change. */}
          <Bar
            dataKey="income"
            fill="var(--color-income)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            fill="var(--color-expense)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

function CashflowTooltip({
  active,
  point,
  granularity,
  currency,
}: {
  active?: boolean
  point: Point | undefined
  granularity: Summary["granularity"]
  currency: string
}) {
  if (!active || !point) return null

  return (
    <div className="grid min-w-44 gap-2 rounded-md bg-canvas px-3 py-2.5 text-body-sm shadow-xl ring-1 ring-ink/5">
      <p className="font-semibold text-ink">{formatPeriod(point.period, granularity, true)}</p>
      <dl className="grid gap-1">
        {(["income", "expense"] as const).map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-body">
              <span
                className="size-2 rounded-xs"
                style={{ background: config[key].color }}
                aria-hidden
              />
              {config[key].label}
            </dt>
            <dd className="font-semibold text-ink tabular-nums">
              {formatMoney(point[key], currency)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-4 border-t pt-1.5">
          <dt className="text-body">Net</dt>
          <dd className="font-semibold text-ink tabular-nums">
            {formatMoney(point.net, currency, { sign: true })}
          </dd>
        </div>
      </dl>
    </div>
  )
}
