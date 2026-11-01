import assert from "node:assert/strict"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { createDb, schema } from "@cockpit/db"
import { ensureOwner } from "@cockpit/db/owner"
import { eq, sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { hc, parseResponse } from "hono/client"

import type { AppType } from "../app"
import { dateInTimezone } from "../lib/pomodoro-analytics"

const testUrl = process.env.POMODORO_TEST_DATABASE_URL
const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url))

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
      await migrate(db, { migrationsFolder })
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
              resumedAt: new Date(Date.now() - 35_000),
            })
            .where(eq(schema.pomodoroSession.id, id))
          const paused = await parseResponse(
            client.pomodoro.$post({ json: { action: "pause", id } }),
          )
          assert.equal(paused.current?.status, "paused")
          assert.equal(paused.current?.resumedAt, null)
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
            .set({
              startedAt: new Date(deadline.getTime() - 1800_000),
              resumedAt: new Date(deadline.getTime() - 1800_000),
            })
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

      await t.test(
        "flow runs past any duration, keeps worked time across pauses and finishes as completed",
        async () => {
          const today = dateInTimezone(new Date(), "UTC")
          const query = { query: { from: today, to: today, timezone: "UTC" } }
          const before = await parseResponse(client.pomodoro.analytics.$get(query))
          const started = await parseResponse(
            client.pomodoro.$post({
              json: { action: "start", id: crypto.randomUUID(), kind: "flow", title: "Writing" },
            }),
          )
          assert.ok(started.current)
          const flowId = started.current.id
          assert.equal(started.current.kind, "flow")
          assert.equal(started.current.plannedSeconds, null)
          assert.equal(started.current.title, "Writing")
          const fiveHoursAgo = new Date(Date.now() - 5 * 3600_000)
          await db
            .update(schema.pomodoroSession)
            .set({ startedAt: fiveHoursAgo, resumedAt: fiveHoursAgo })
            .where(eq(schema.pomodoroSession.id, flowId))
          const stillRunning = await parseResponse(client.pomodoro.$get())
          assert.equal(stillRunning.current?.id, flowId)
          assert.equal(stillRunning.current?.status, "running")

          const paused = await parseResponse(
            client.pomodoro.$post({ json: { action: "pause", id: flowId } }),
          )
          assert.equal(paused.current?.status, "paused")
          assert.equal(paused.current?.resumedAt, null)
          const pausedSeconds = paused.current?.elapsedSeconds ?? 0
          assert.ok(pausedSeconds >= 5 * 3600 && pausedSeconds < 5 * 3600 + 30)

          const resumed = await parseResponse(
            client.pomodoro.$post({ json: { action: "resume", id: flowId } }),
          )
          assert.equal(resumed.current?.status, "running")
          assert.equal(resumed.current?.elapsedSeconds, pausedSeconds)
          await db
            .update(schema.pomodoroSession)
            .set({ resumedAt: new Date(Date.now() - 600_000) })
            .where(eq(schema.pomodoroSession.id, flowId))

          const finished = await parseResponse(
            client.pomodoro.$post({ json: { action: "stop", id: flowId } }),
          )
          assert.equal(finished.current, null)
          assert.equal(finished.lastSession?.id, flowId)
          assert.equal(finished.lastSession?.status, "completed")
          assert.equal(finished.completedFocusCount, 1)
          const flowSeconds = finished.lastSession?.elapsedSeconds ?? 0
          assert.ok(flowSeconds >= pausedSeconds + 600 && flowSeconds < pausedSeconds + 630)

          const after = await parseResponse(client.pomodoro.analytics.$get(query))
          assert.deepEqual(after.summary, {
            ...before.summary,
            seconds: before.summary.seconds + flowSeconds,
          })
          assert.deepEqual(after.today, {
            seconds: before.today.seconds + flowSeconds,
            completed: before.today.completed,
          })
          assert.equal(after.sessions[0]?.id, flowId)
          assert.equal(after.sessions[0]?.plannedSeconds, null)
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

test(
  "migrating from the endsAt model keeps running countdowns on their deadline",
  { skip: !testUrl },
  async () => {
    assert.ok(testUrl)
    const admin = createDb(testUrl)
    const name = `pomodoro_migration_${crypto.randomUUID().replaceAll("-", "")}`
    const url = new URL(testUrl)
    url.pathname = `/${name}`
    const folder = await mkdtemp(join(tmpdir(), "pomodoro-migrations-"))
    await admin.execute(sql.raw(`create database "${name}"`))
    const db = createDb(url.toString())
    try {
      await cp(migrationsFolder, folder, { recursive: true })
      const journalPath = join(folder, "meta", "_journal.json")
      const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
        entries: { tag: string }[]
      }
      const last = journal.entries.findIndex((entry) => entry.tag === "0007_yummy_lily_hollister")
      assert.ok(last >= 0)
      journal.entries = journal.entries.slice(0, last + 1)
      await writeFile(journalPath, JSON.stringify(journal))
      await migrate(db, { migrationsFolder: folder })

      await db.execute(sql`
        insert into "user" (id, name, email) values ('migration-owner', 'Owner', 'm@example.com');
      `)
      await db.execute(sql`
        insert into pomodoro_session
          (id, user_id, kind, status, title, planned_seconds, elapsed_seconds, started_at, ends_at, finished_at)
        values
          ('00000000-0000-4000-8000-000000000001', 'migration-owner', 'focus', 'running', 'Running',
            1500, 300, '2026-10-31T11:30:00Z', '2026-10-31T12:20:00Z', null),
          ('00000000-0000-4000-8000-000000000002', 'migration-owner', 'short_break', 'completed', 'Done',
            300, 300, '2026-10-31T10:00:00Z', null, '2026-10-31T10:05:00Z')
      `)
      await migrate(db, { migrationsFolder })

      const rows = await db.select().from(schema.pomodoroSession).orderBy(schema.pomodoroSession.id)
      assert.deepEqual(
        rows.map((row) => ({
          status: row.status,
          plannedSeconds: row.plannedSeconds,
          elapsedSeconds: row.elapsedSeconds,
          resumedAt: row.resumedAt?.toISOString() ?? null,
        })),
        [
          {
            status: "running",
            plannedSeconds: 1500,
            elapsedSeconds: 300,
            resumedAt: "2026-10-31T12:00:00.000Z",
          },
          { status: "completed", plannedSeconds: 300, elapsedSeconds: 300, resumedAt: null },
        ],
      )
      const columns = await db.execute<{ column_name: string }>(sql`
        select column_name from information_schema.columns
        where table_name = 'pomodoro_session' and column_name = 'ends_at'
      `)
      assert.equal(columns.rows.length, 0)
    } finally {
      await db.$client.end()
      await admin.execute(sql.raw(`drop database if exists "${name}" with (force)`))
      await admin.$client.end()
      await rm(folder, { recursive: true, force: true })
    }
  },
)
