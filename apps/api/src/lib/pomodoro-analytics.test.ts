import assert from "node:assert/strict"
import { test } from "node:test"

import {
  clockLabel,
  DEFAULT_POMODORO_SETTINGS,
  liveElapsedSeconds,
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
    resumedAt: null,
    finishedAt: new Date("2026-10-31T00:10:00Z"),
    ...overrides,
  }
}

test("running timers count from their last resume; paused timers never consume pause time", () => {
  const running = {
    status: "running",
    resumedAt: "2026-10-31T12:00:00Z",
    plannedSeconds: 1500,
    elapsedSeconds: 300,
  }
  assert.equal(liveElapsedSeconds(running, Date.parse("2026-10-31T12:10:00.900Z")), 900)
  assert.equal(remainingSeconds(running, Date.parse("2026-10-31T12:10:00Z")), 600)
  assert.equal(remainingSeconds(running, Date.parse("2026-10-31T11:59:59Z")), 1200)
  assert.equal(remainingSeconds(running, Date.parse("2026-10-31T15:00:00Z")), 0)
  const paused = { ...running, status: "paused", resumedAt: null, elapsedSeconds: 600 }
  assert.equal(liveElapsedSeconds(paused, Date.parse("2026-11-01T12:00:00Z")), 600)
  assert.equal(remainingSeconds(paused, Date.parse("2026-11-01T12:00:00Z")), 900)
})

test("flow timers count up without a cap and have no remaining time", () => {
  const flow = {
    status: "running",
    resumedAt: "2026-10-31T12:00:00Z",
    plannedSeconds: null,
    elapsedSeconds: 1200,
  }
  const later = Date.parse("2026-10-31T15:00:00Z")
  assert.equal(liveElapsedSeconds(flow, later), 1200 + 3 * 3600)
  assert.equal(remainingSeconds(flow, later), null)
  assert.equal(liveElapsedSeconds({ ...flow, status: "paused", resumedAt: null }, later), 1200)
  assert.equal(plannedSeconds("flow", DEFAULT_POMODORO_SETTINGS), null)
})

test("clock shows hours once a session passes an hour", () => {
  assert.equal(clockLabel(0), "00:00")
  assert.equal(clockLabel(3599), "59:59")
  assert.equal(clockLabel(3600), "1:00:00")
  assert.equal(clockLabel(2 * 3600 + 14 * 60 + 5), "2:14:05")
})

test("completed focus sessions suggest a long break every fourth session", () => {
  assert.equal(nextKind({ kind: "focus", status: "completed" }, 3, 4), "short_break")
  assert.equal(nextKind({ kind: "focus", status: "completed" }, 4, 4), "long_break")
  assert.equal(nextKind({ kind: "focus", status: "interrupted" }, 4, 4), "focus")
  assert.equal(nextKind({ kind: "long_break", status: "completed" }, 4, 4), "focus")
  assert.equal(plannedSeconds("focus", DEFAULT_POMODORO_SETTINGS), 1500)
})

test("after a flow session the suggested mode stays flow", () => {
  assert.equal(nextKind({ kind: "flow", status: "completed" }, 4, 4), "flow")
  assert.equal(nextKind({ kind: "flow", status: "completed" }, 3, 4), "flow")
})

test("flow time counts toward focus time and streak but not session counts", () => {
  const flow = (overrides: Partial<FocusSession>) =>
    session({ kind: "flow", plannedSeconds: null, elapsedSeconds: 7200, ...overrides })
  const rows = [
    session({ projectName: "Cockpit", finishedAt: new Date("2026-10-31T09:00:00Z") }),
    flow({ projectName: "Cockpit", finishedAt: new Date("2026-10-31T15:00:00Z") }),
    flow({ finishedAt: new Date("2026-10-30T15:00:00Z"), elapsedSeconds: 3000 }),
    flow({ finishedAt: new Date("2026-10-29T15:00:00Z"), elapsedSeconds: 2700 }),
  ]
  const report = focusAnalytics(rows, {
    from: "2026-10-30",
    to: "2026-10-31",
    timezone: "UTC",
    today: "2026-10-31",
  })
  assert.deepEqual(report.today, { seconds: 1500 + 7200, completed: 1 })
  assert.deepEqual(report.series, [
    { date: "2026-10-30", seconds: 3000, completed: 0, interrupted: 0 },
    { date: "2026-10-31", seconds: 8700, completed: 1, interrupted: 0 },
  ])
  assert.deepEqual(report.summary, { seconds: 11700, completed: 1, interrupted: 0, activeDays: 2 })
  assert.deepEqual(report.projects, [
    { name: "Cockpit", seconds: 8700, completed: 1 },
    { name: "No project", seconds: 3000, completed: 0 },
  ])
  assert.equal(report.streak, 3)
  assert.deepEqual(
    report.sessions.map((s) => s.kind),
    ["flow", "focus", "flow"],
  )
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
