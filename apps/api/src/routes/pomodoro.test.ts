import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { createDb, schema } from "@cockpit/db"
import { ensureOwner } from "@cockpit/db/owner"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { hc, parseResponse } from "hono/client"

import type { AppType } from "../app"
import { dateInTimezone } from "../lib/pomodoro-analytics"

const testUrl = process.env.POMODORO_TEST_DATABASE_URL

// Use a dedicated disposable database. No application database is migrated or cleared.
test(
  "Pomodoro API persists timers and reports with real authentication and PostgreSQL",
  { skip: !testUrl },
  async (t) => {
    assert.ok(testUrl)
    process.env.DATABASE_URL = testUrl
    process.env.BETTER_AUTH_SECRET = "pomodoro-test-secret-for-disposable-database-only"
    process.env.BETTER_AUTH_URL = "http://localhost:3000"
    process.env.WEB_URL = "http://localhost:5173"
    const db = createDb(testUrl)
    const { app } = await import("../app")
    const { db: serviceDb, runtime } = await import("../lib/services")
    try {
      await migrate(db, {
        migrationsFolder: fileURLToPath(
          new URL("../../../../packages/db/drizzle", import.meta.url),
        ),
      })
      const owner = await ensureOwner(db, {
        email: "pomodoro-test@example.com",
        password: "disposable-test-password",
        name: "Timer test",
      })
      const other = await ensureOwner(db, {
        email: "pomodoro-other@example.com",
        password: "disposable-test-password",
        name: "Other test",
      })
      const signIn = await app.request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
          "x-real-ip": "127.0.0.42",
        },
        body: JSON.stringify({ email: owner.email, password: "disposable-test-password" }),
      })
      assert.equal(signIn.status, 200)
      const cookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ")
      assert.ok(cookie)
      const dispatch: typeof fetch = async (input, init) => app.request(new Request(input, init))
      const client = hc<AppType>("http://localhost:3000", {
        headers: { Cookie: cookie },
        fetch: dispatch,
      }).api
      const [project] = await db
        .insert(schema.project)
        .values({ userId: owner.id, name: "Test project", emoji: "🧠" })
        .returning()
      const [task] = await db
        .insert(schema.task)
        .values({ userId: owner.id, projectId: project!.id, title: "Test task", position: 0 })
        .returning()
      const [foreignTask] = await db
        .insert(schema.task)
        .values({ userId: other.id, title: "Private task", position: 0 })
        .returning()
      let id = ""
      let partialSeconds = 0

      await t.test(
        "requires authentication and validates settings, timezones and date ranges",
        async () => {
          for (const path of [
            "/pomodoro",
            "/pomodoro/analytics?from=2026-10-01&to=2026-10-31&timezone=UTC",
          ]) {
            assert.equal((await app.request(`http://localhost:3000/api${path}`)).status, 401)
          }
          const state = await parseResponse(client.pomodoro.$get())
          assert.equal(state.settings.focusMinutes, 25)
          assert.equal(state.current, null)
          assert.equal(
            (await client.pomodoro.settings.$put({ json: { ...state.settings, focusMinutes: 0 } }))
              .status,
            422,
          )
          assert.equal(
            (
              await client.pomodoro.analytics.$get({
                query: { from: "2026-10-31", to: "2026-10-01", timezone: "UTC" },
              })
            ).status,
            422,
          )
          assert.equal(
            (
              await client.pomodoro.analytics.$get({
                query: { from: "2026-10-01", to: "2026-10-31", timezone: "not-a-timezone" },
              })
            ).status,
            422,
          )
          assert.equal(
            (
              await client.pomodoro.$post({
                json: {
                  action: "start",
                  id: crypto.randomUUID(),
                  kind: "focus",
                  taskId: foreignTask!.id,
                },
              })
            ).status,
            409,
          )
        },
      )

      await t.test(
        "simultaneous starts create exactly one active session; retrying it is idempotent",
        async () => {
          const attempts = await Promise.all(
            [0, 1].map(() =>
              client.pomodoro.$post({
                json: { action: "start", id: crypto.randomUUID(), kind: "focus", taskId: task!.id },
              }),
            ),
          )
          assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 409])
          const state = await parseResponse(client.pomodoro.$get())
          assert.ok(state.current)
          id = state.current.id
          assert.equal(state.current.title, "Test task")
          assert.equal(state.current.projectName, "Test project")
          assert.equal(state.current.plannedSeconds, 1500)
          await parseResponse(
            client.pomodoro.$post({ json: { action: "start", id, kind: "focus" } }),
          )
          assert.equal(
            (
              await db
                .select()
                .from(schema.pomodoroSession)
                .where(eq(schema.pomodoroSession.userId, owner.id))
            ).length,
            1,
          )
          const updated = await parseResponse(
            client.pomodoro.settings.$put({ json: { ...state.settings, focusMinutes: 30 } }),
          )
          assert.equal(updated.current?.plannedSeconds, 1500)
          assert.equal(updated.settings.focusMinutes, 30)
        },
      )

      await t.test(
        "pause/resume preserves worked time; stopping saves partial effort once",
        async () => {
          await db
            .update(schema.pomodoroSession)
            .set({
              startedAt: new Date(Date.now() - 35_000),
              endsAt: new Date(Date.now() + 1465_000),
            })
            .where(eq(schema.pomodoroSession.id, id))
          const paused = await parseResponse(
            client.pomodoro.$post({ json: { action: "pause", id } }),
          )
          assert.equal(paused.current?.status, "paused")
          assert.equal(paused.current?.endsAt, null)
          assert.ok(paused.current && paused.current.elapsedSeconds >= 35)
          const restored = await parseResponse(client.pomodoro.$get())
          assert.equal(restored.current?.elapsedSeconds, paused.current.elapsedSeconds)
          const resumed = await parseResponse(
            client.pomodoro.$post({ json: { action: "resume", id } }),
          )
          assert.equal(resumed.current?.status, "running")
          assert.equal(resumed.current?.elapsedSeconds, paused.current.elapsedSeconds)
          const stopped = await parseResponse(
            client.pomodoro.$post({ json: { action: "stop", id } }),
          )
          assert.equal(stopped.current, null)
          assert.equal(stopped.lastSession?.status, "interrupted")
          assert.equal(stopped.completedFocusCount, 0)
          partialSeconds = stopped.lastSession?.elapsedSeconds ?? 0
          await parseResponse(client.pomodoro.$post({ json: { action: "stop", id } }))
          assert.equal(
            (
              await db
                .select()
                .from(schema.pomodoroSession)
                .where(eq(schema.pomodoroSession.userId, owner.id))
            ).length,
            1,
          )
        },
      )

      await t.test(
        "overdue timers complete at their deadline without automatically starting another",
        async () => {
          await db
            .update(schema.pomodoroSession)
            .set({ finishedAt: new Date(Date.now() - 10_000) })
            .where(eq(schema.pomodoroSession.id, id))
          const active = await parseResponse(
            client.pomodoro.$post({
              json: { action: "start", id: crypto.randomUUID(), kind: "focus", taskId: task!.id },
            }),
          )
          assert.ok(active.current)
          const deadline = new Date(Date.now() - 2000)
          await db
            .update(schema.pomodoroSession)
            .set({ startedAt: new Date(deadline.getTime() - 1800_000), endsAt: deadline })
            .where(eq(schema.pomodoroSession.id, active.current.id))
          const restored = await parseResponse(client.pomodoro.$get())
          assert.equal(restored.current, null)
          assert.equal(restored.lastSession?.status, "completed")
          assert.equal(restored.lastSession?.elapsedSeconds, 1800)
          assert.equal(restored.lastSession?.finishedAt, deadline.toISOString())
          assert.equal(restored.completedFocusCount, 1)
          const next = await parseResponse(
            client.pomodoro.$post({
              json: { action: "start", id: crypto.randomUUID(), kind: "short_break" },
            }),
          )
          assert.ok(next.current)
          await parseResponse(
            client.pomodoro.$post({ json: { action: "stop", id: active.current.id } }),
          )
          assert.equal((await parseResponse(client.pomodoro.$get())).current?.id, next.current.id)
          await parseResponse(
            client.pomodoro.$post({ json: { action: "stop", id: next.current.id } }),
          )
        },
      )

      await t.test(
        "reports exclude breaks, retain deleted task/project history and isolate users",
        async () => {
          const today = dateInTimezone(new Date(), "UTC")
          const before = await parseResponse(
            client.pomodoro.analytics.$get({ query: { from: today, to: today, timezone: "UTC" } }),
          )
          assert.equal(before.summary.completed, 1)
          assert.equal(before.summary.interrupted, 1)
          assert.equal(before.summary.seconds, 1800 + partialSeconds)
          assert.equal(before.streak, 1)
          await db.delete(schema.project).where(eq(schema.project.id, project!.id))
          const after = await parseResponse(
            client.pomodoro.analytics.$get({ query: { from: today, to: today, timezone: "UTC" } }),
          )
          assert.deepEqual(after.summary, before.summary)
          assert.equal(after.sessions[0]?.title, "Test task")
          assert.equal(after.sessions[0]?.projectName, "Test project")
          assert.ok(
            after.sessions.every(
              (session) => session.taskId === null && session.projectId === null,
            ),
          )
          await db.insert(schema.pomodoroSession).values({
            userId: other.id,
            kind: "focus",
            status: "completed",
            title: "Other owner",
            plannedSeconds: 1500,
            elapsedSeconds: 1500,
            startedAt: new Date(Date.now() - 1500_000),
            finishedAt: new Date(),
          })
          assert.deepEqual(
            (
              await parseResponse(
                client.pomodoro.analytics.$get({
                  query: { from: today, to: today, timezone: "UTC" },
                }),
              )
            ).summary,
            before.summary,
          )
        },
      )
    } finally {
      await db.delete(schema.user).where(eq(schema.user.email, "pomodoro-test@example.com"))
      await db.delete(schema.user).where(eq(schema.user.email, "pomodoro-other@example.com"))
      await runtime.dispose()
      await serviceDb.$client.end()
      await db.$client.end()
    }
  },
)
