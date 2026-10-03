import type { Frequency } from "../shared/finance"

/** Calendar dates as `YYYY-MM-DD` strings, all arithmetic in UTC so timezones never shift a day. */
export type IsoDate = string

const parse = (date: IsoDate) => new Date(`${date}T00:00:00Z`)
const format = (date: Date): IsoDate => date.toISOString().slice(0, 10)

export const today = (): IsoDate => format(new Date())

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return format(d)
}

/** Adds months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number]
  const total = year * 12 + (month - 1) + months
  const y = Math.floor(total / 12)
  const m = total - y * 12
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return format(new Date(Date.UTC(y, m, Math.min(day, lastDay))))
}

export function daysBetween(from: IsoDate, to: IsoDate) {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000)
}

export const monthOf = (date: IsoDate) => date.slice(0, 7)

export type Schedule = {
  startDate: IsoDate
  endDate: IsoDate | null
  frequency: Frequency
  interval: number
}

/** The `k`-th occurrence of a schedule (0 = `startDate`), always computed from the anchor. */
export function occurrence({ startDate, frequency, interval }: Schedule, k: number): IsoDate {
  switch (frequency) {
    case "daily":
      return addDays(startDate, k * interval)
    case "weekly":
      return addDays(startDate, k * interval * 7)
    case "monthly":
      return addMonths(startDate, k * interval)
    case "yearly":
      return addMonths(startDate, k * interval * 12)
  }
}

/** Index of the first occurrence on or after `date`. */
export function occurrenceIndexFrom(schedule: Schedule, date: IsoDate) {
  let k = 0
  while (occurrence(schedule, k) < date) k++
  return k
}

/** First occurrence on or after `date`, or null if the schedule has ended by then. */
export function nextOccurrence(schedule: Schedule, date: IsoDate): IsoDate | null {
  const next = occurrence(schedule, occurrenceIndexFrom(schedule, date))
  return schedule.endDate && next > schedule.endDate ? null : next
}

/** Average occurrences per month, used to show what a schedule costs monthly. */
export function perMonth({ frequency, interval }: Pick<Schedule, "frequency" | "interval">) {
  const perMonthAtInterval1 = {
    daily: 365.25 / 12,
    weekly: 365.25 / 12 / 7,
    monthly: 1,
    yearly: 1 / 12,
  }
  return perMonthAtInterval1[frequency] / interval
}
