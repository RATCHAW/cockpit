import { Input } from "@cockpit/ui/components/input"
import { Tabs, TabsList, TabsTrigger } from "@cockpit/ui/components/tabs"

import { PERIODS, type Period } from "~/lib/finance"

export function PeriodPicker({
  period,
  from,
  to,
  onChange,
}: {
  period: Period
  from?: string
  to?: string
  onChange: (next: { period: Period; from?: string; to?: string }) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Scrolls sideways on narrow screens instead of wrapping into a ragged grid. */}
      <div className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <Tabs
          value={period}
          onValueChange={(value) => onChange({ period: value as Period, from, to })}
        >
          <TabsList aria-label="Period" className="bg-canvas">
            {Object.entries(PERIODS).map(([value, { label }]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="data-[state=active]:bg-ink data-[state=active]:text-canvas"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {period === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="From"
            value={from ?? ""}
            max={to}
            onChange={(e) => onChange({ period, from: e.target.value || undefined, to })}
            className="h-12 w-auto"
          />
          <span className="text-body-sm text-body">to</span>
          <Input
            type="date"
            aria-label="To"
            value={to ?? ""}
            min={from}
            onChange={(e) => onChange({ period, from, to: e.target.value || undefined })}
            className="h-12 w-auto"
          />
        </div>
      ) : null}
    </div>
  )
}
