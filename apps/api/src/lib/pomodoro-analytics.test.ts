import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_POMODORO_SETTINGS,
  nextKind,
  plannedSeconds,
  remainingSeconds,
} from "../shared/pomodoro"
import type { FocusSession } from "./pomodoro"
import { dateInTimezone, focusAnalytics } from "./pomodoro-analytics"

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: crypto.randomUUID(),
    userId: "owner",
    kind: "focus",
    status: "completed",
    taskId: null,
    projectId: null,
    title: "Deep work",
    projectName: null,
    plannedSeconds: 1500,
    elapsedSeconds: 1500,
    startedAt: new Date("2026-10-30T23:30:00Z"),
    endsAt: null,
    finishedAt: new Date("2026-10-31T00:10:00Z"),
    ...overrides,
  }
}

test("running timers use their deadline; paused timers never consume pause time", () => {
  const running = {
    status: "running",
    endsAt: "2026-10-31T12:25:00Z",
    plannedSeconds: 1500,
    elapsedSeconds: 0,
  }
  assert.equal(remainingSeconds(running, Date.parse("2026-10-31T12:10:00Z")), 900)
  assert.equal(remainingSeconds(running, Date.parse("2026-10-31T11:59:59Z")), 1500)
  assert.equal(remainingSeconds(running, Date.parse("2026-10-31T15:00:00Z")), 0)
  const paused = { ...running, status: "paused", endsAt: null, elapsedSeconds: 600 }
  assert.equal(remainingSeconds(paused, Date.parse("2026-11-01T12:00:00Z")), 900)
})

test("completed focus sessions suggest a long break every fourth session", () => {
  assert.equal(nextKind({ kind: "focus", status: "completed" }, 3, 4), "short_break")
  assert.equal(nextKind({ kind: "focus", status: "completed" }, 4, 4), "long_break")
  assert.equal(nextKind({ kind: "focus", status: "interrupted" }, 4, 4), "focus")
  assert.equal(nextKind({ kind: "long_break", status: "completed" }, 4, 4), "focus")
  assert.equal(plannedSeconds("focus", DEFAULT_POMODORO_SETTINGS), 1500)
})

test("reports use the local finish date, include stopped focus time, and exclude breaks", () => {
  const rows = [
    session({ projectName: "Cockpit" }),
    session({ status: "interrupted", elapsedSeconds: 180, projectName: "Cockpit" }),
    session({ kind: "short_break", elapsedSeconds: 300, plannedSeconds: 300 }),
  ]
  const report = focusAnalytics(rows, {
    from: "2026-10-29",
    to: "2026-10-31",
    timezone: "America/New_York",
    today: "2026-10-31",
  })
  assert.deepEqual(report.series, [
    { date: "2026-10-29", seconds: 0, completed: 0, interrupted: 0 },
    { date: "2026-10-30", seconds: 1680, completed: 1, interrupted: 1 },
    { date: "2026-10-31", seconds: 0, completed: 0, interrupted: 0 },
  ])
  assert.deepEqual(report.summary, { seconds: 1680, completed: 1, interrupted: 1, activeDays: 1 })
  assert.deepEqual(report.projects, [{ name: "Cockpit", seconds: 1680, completed: 1 }])
  assert.equal(report.streak, 1)
  assert.equal(report.sessions.length, 2)
  assert.equal(dateInTimezone(rows[0]!.finishedAt!, "Asia/Tokyo"), "2026-10-31")
})

test("streak spans report ranges, tolerates an unfinished today and needs completed sessions", () => {
  const rows = [
    session({ finishedAt: new Date("2026-10-28T12:00:00Z") }),
    session({ finishedAt: new Date("2026-10-29T12:00:00Z") }),
    session({ finishedAt: new Date("2026-10-30T12:00:00Z") }),
    session({
      status: "interrupted",
      elapsedSeconds: 100,
      finishedAt: new Date("2026-10-31T12:00:00Z"),
    }),
  ]
  const report = focusAnalytics(rows, {
    from: "2026-10-31",
    to: "2026-10-31",
    timezone: "UTC",
    today: "2026-10-31",
  })
  assert.equal(report.streak, 3)
  assert.deepEqual(report.today, { seconds: 100, completed: 0 })
  assert.equal(
    focusAnalytics(rows, {
      from: "2026-11-02",
      to: "2026-11-02",
      timezone: "UTC",
      today: "2026-11-02",
    }).streak,
    0,
  )
})

test("DST days remain consecutive calendar dates and empty days are retained", () => {
  const rows = [
    session({ finishedAt: new Date("2026-11-01T05:30:00Z") }),
    session({ finishedAt: new Date("2026-11-01T06:30:00Z") }),
  ]
  const report = focusAnalytics(rows, {
    from: "2026-10-31",
    to: "2026-11-02",
    timezone: "America/New_York",
    today: "2026-11-01",
  })
  assert.equal(report.series.length, 3)
  assert.equal(report.series[1]?.completed, 2)
  assert.equal(report.series[1]?.seconds, 3000)
})
