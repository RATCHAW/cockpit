import { Button } from "@cockpit/ui/components/button"
import { ChartContainer, type ChartConfig } from "@cockpit/ui/components/chart"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronLeftIcon, ChevronRightIcon, FlameIcon, TimerIcon } from "lucide-react"
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"

import { usePomodoro } from "~/hooks/use-pomodoro"
import { formatDate } from "~/lib/finance"
import { analyticsQueryOptions, durationLabel, type FocusAnalytics } from "~/lib/pomodoro"
import { addDays, localToday } from "~/lib/projects"

export function TodayFocus() {
  const { query: timer } = usePomodoro()
  const today = localToday()
  const report = useQuery(analyticsQueryOptions(today, today))
  const goal = timer.data?.settings.dailyGoal ?? 4
  const data = report.data
  return (
    <aside className="grid content-start gap-6">
      <section className="grid gap-5 rounded-xl border p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-body-lg font-semibold">Your day, in focus</h2>
          <TimerIcon className="size-5 text-body" aria-hidden />
        </div>
        {report.isError ? (
          <p role="alert" className="text-body-sm text-negative-darkest">
            Couldn't load today's progress.{" "}
            <button type="button" className="underline" onClick={() => void report.refetch()}>
              Retry
            </button>
          </p>
        ) : !data ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : (
          <>
            <div>
              <p className="font-display text-display-md tabular-nums">
                {durationLabel(data.today.seconds)}
              </p>
              <p className="mt-2 text-body-sm text-body">of focused time today</p>
            </div>
            <div className="grid gap-2">
              <div className="flex justify-between gap-3 text-body-sm">
                <span>Daily goal</span>
                <span className="font-semibold tabular-nums">
                  {data.today.completed} / {goal} sessions
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Daily focus goal"
                aria-valuemin={0}
                aria-valuemax={goal}
                aria-valuenow={Math.min(goal, data.today.completed)}
                className="h-2 overflow-hidden rounded-full bg-canvas-soft"
              >
                <div
                  className="h-full rounded-full bg-positive"
                  style={{ width: `${Math.min(100, (data.today.completed / goal) * 100)}%` }}
                />
              </div>
              <p className="text-caption text-body">
                {data.today.completed >= goal
                  ? "Daily goal reached. Nice work."
                  : `${goal - data.today.completed} more to your daily goal.`}
              </p>
            </div>
            <div className="flex items-center gap-3 border-t pt-4">
              <FlameIcon className="size-5 text-body" aria-hidden />
              <div>
                <p className="text-body-sm font-semibold">
                  {data.streak} day{data.streak === 1 ? "" : "s"} in a row
                </p>
                <p className="text-caption text-body">
                  Complete one focus session to keep it going.
                </p>
              </div>
            </div>
          </>
        )}
      </section>
      <section className="grid gap-3 px-1 text-body-sm text-body">
        <h2 className="font-semibold text-ink">A little rhythm goes a long way.</h2>
        <p>
          Pick one task. Focus until the timer ends, then give yourself a real break. After{" "}
          {timer.data?.settings.longBreakEvery ?? 4} sessions, take a longer one.
        </p>
        <p>
          Your timer keeps going as you move around Cockpit or close the tab. Start the next
          interval when you’re ready.
        </p>
        <p>
          Ending early saves the time you put in. Only full focus sessions count toward your goal
          and streak.
        </p>
      </section>
    </aside>
  )
}

const config = { minutes: { label: "Focus time", color: "var(--color-ink)" } } satisfies ChartConfig
const periods = [7, 30, 90] as const

export function FocusReport() {
  const [days, setDays] = useState<number>(7)
  const [end, setEnd] = useState<string | null>(null)
  const today = localToday()
  const to = end ?? today
  const from = addDays(to, -(days - 1))
  const report = useQuery({ ...analyticsQueryOptions(from, to), placeholderData: keepPreviousData })
  const data = report.data
  const move = (direction: number) => {
    const next = addDays(to, direction * days)
    setEnd(next >= today ? null : next)
  }
  return (
    <section
      className="grid min-w-0 gap-6 border-t pt-8"
      aria-label="Focus analytics"
      aria-busy={report.isFetching}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="font-display text-display-xs">See your rhythm</h2>
          <p className="text-body-sm text-body">
            Small sessions add up. Here’s where your time went.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-canvas-soft p-1" aria-label="Report range">
            {periods.map((period) => (
              <Button
                size="sm"
                key={period}
                variant="ghost"
                className={cn(days === period && "bg-canvas")}
                aria-pressed={days === period}
                onClick={() => {
                  setDays(period)
                  setEnd(null)
                }}
              >
                {period} days
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous period"
              onClick={() => move(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next period"
              disabled={to >= today}
              onClick={() => move(1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </header>
      <p className="text-body-sm text-body">
        {formatDate(from, { month: "short", day: "numeric", year: "numeric" })} –{" "}
        {formatDate(to, { month: "short", day: "numeric", year: "numeric" })}
      </p>
      {report.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-negative-bg p-4 text-white"
        >
          <p>Couldn't load your focus history.</p>
          <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {!data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <div className={cn("grid gap-6", report.isPlaceholderData && "opacity-50")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Focused time"
              value={durationLabel(data.summary.seconds)}
              detail="Breaks and pauses excluded"
            />
            <Stat
              label="Completed sessions"
              value={String(data.summary.completed)}
              detail={`${data.summary.interrupted} ended early`}
            />
            <Stat
              label="Daily average"
              value={durationLabel(Math.round(data.summary.seconds / days))}
              detail={`Across all ${days} days`}
            />
            <Stat
              label="Active days"
              value={String(data.summary.activeDays)}
              detail={`Out of ${days} days`}
            />
          </div>
          <div className="grid gap-4 rounded-xl bg-canvas-soft/50 p-4 sm:p-6">
            <h3 className="text-body-sm font-semibold">
              Focus time by day <span className="font-normal text-body">· minutes</span>
            </h3>
            <ChartContainer config={config} className="aspect-auto h-64 w-full sm:h-72">
              <BarChart
                data={data.series.map((day) => ({ ...day, minutes: day.seconds / 60 }))}
                accessibilityLayer
                margin={{ top: 8, right: 0, bottom: 0, left: -20 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(date: string) =>
                    formatDate(date, { month: "short", day: "numeric" })
                  }
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={48} />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: "var(--color-canvas-soft)" }}
                  labelFormatter={(label) =>
                    typeof label === "string"
                      ? formatDate(label, { weekday: "short", month: "short", day: "numeric" })
                      : label
                  }
                  formatter={(value) => [
                    typeof value === "number" ? durationLabel(Math.round(value * 60)) : "",
                    "Focus time",
                  ]}
                  contentStyle={{
                    borderRadius: 12,
                    background: "var(--color-canvas)",
                    border: "1px solid var(--color-border)",
                  }}
                />
                <Bar
                  dataKey="minutes"
                  fill="var(--color-minutes)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            {data.summary.seconds === 0 ? (
              <p className="text-center text-body-sm text-body">
                No focus time in this period. Your first session is a good place to start.
              </p>
            ) : null}
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ProjectBreakdown data={data} />
            <SessionHistory sessions={data.sessions} />
          </div>
          <p className="text-caption text-body">
            Times use your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Sessions
            count on the day they finish. Focus totals include time from sessions ended early;
            breaks and pauses are excluded.
          </p>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid content-start gap-2 rounded-xl bg-canvas-soft/60 p-4 sm:p-5">
      <p className="text-body-sm text-body">{label}</p>
      <p className="font-display text-display-sm tabular-nums">{value}</p>
      <p className="text-caption text-body">{detail}</p>
    </div>
  )
}

function ProjectBreakdown({ data }: { data: FocusAnalytics }) {
  return (
    <section className="grid gap-4 rounded-xl border p-5">
      <h3 className="text-body-md font-semibold">Time by project</h3>
      {data.projects.length === 0 ? (
        <p className="text-body-sm text-body">
          Link a focus session to a project to see how your time adds up.
        </p>
      ) : (
        <ul className="grid gap-5">
          {data.projects.map((project) => (
            <li key={project.name} className="grid gap-2">
              <div className="flex items-start justify-between gap-3 text-body-sm">
                <span className="min-w-0 wrap-anywhere">{project.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {durationLabel(project.seconds)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-canvas-soft">
                <div
                  className="h-full rounded-full bg-body"
                  style={{
                    width: `${data.summary.seconds ? (project.seconds / data.summary.seconds) * 100 : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SessionHistory({ sessions }: { sessions: FocusAnalytics["sessions"] }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-body-md font-semibold">Focus history</h3>
        <span className="text-caption text-body">Latest 50 sessions in this period</span>
      </div>
      {sessions.length === 0 ? (
        <p className="py-4 text-body-sm text-body">Your finished sessions will appear here.</p>
      ) : (
        <ul className="grid max-h-96 divide-y overflow-y-auto">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="grid min-w-0 gap-1">
                <p className="text-body-sm font-semibold wrap-anywhere">{session.title}</p>
                <p className="text-caption text-body">{session.projectName ?? "No project"}</p>
                <p className="text-caption text-body">
                  {new Date(session.finishedAt ?? session.startedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="grid shrink-0 justify-items-end gap-1">
                <span className="text-body-sm font-semibold tabular-nums">
                  {durationLabel(session.elapsedSeconds)}
                </span>
                <span
                  className={cn(
                    "text-caption",
                    session.status === "completed" ? "text-positive-deep" : "text-body",
                  )}
                >
                  {session.status === "completed" ? "Completed" : "Ended early"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
