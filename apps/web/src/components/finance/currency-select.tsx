import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cockpit/ui/components/select"

import { currencyOptions, type Currency } from "~/lib/finance"

/** Shows a page in another currency. */
export function CurrencySelect({
  value,
  onChange,
}: {
  value: Currency | undefined
  onChange: (currency: Currency) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger className="min-w-28 bg-canvas" aria-label="Show amounts in">
        <SelectValue placeholder="Currency">{value}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="max-h-80">
        {currencyOptions.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
