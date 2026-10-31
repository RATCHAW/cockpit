import { schema, type Database } from "@cockpit/db"
import { createRoute, z } from "@hono/zod-openapi"
import { and, eq, inArray } from "drizzle-orm"

import { daysBetween } from "../lib/dates"
import { createRouter } from "../lib/hono"
import { requireAuth } from "../lib/middleware"
import { errorResponse, IsoDateSchema, jsonContent } from "../lib/openapi"
import { changeTimer, settleTimer, timerState } from "../lib/pomodoro"
import { dateInTimezone, focusAnalytics } from "../lib/pomodoro-analytics"
import { Db, runtime } from "../lib/services"
import { PomodoroKindSchema, PomodoroSettingsSchema } from "../shared/pomodoro"

const SessionSchema = z
  .object({
    id: z.uuid(),
    userId: z.string(),
    kind: PomodoroKindSchema,
    status: z.enum(["running", "paused", "completed", "interrupted"]),
    taskId: z.uuid().nullable(),
    projectId: z.uuid().nullable(),
    title: z.string(),
    projectName: z.string().nullable(),
    plannedSeconds: z.number(),
    elapsedSeconds: z.number(),
    startedAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .openapi("PomodoroSession")

const StateSchema = z
  .object({
    serverNow: z.iso.datetime(),
    settings: PomodoroSettingsSchema,
    current: SessionSchema.nullable(),
    lastSession: SessionSchema.nullable(),
    completedFocusCount: z.number(),
  })
  .openapi("PomodoroState")

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    id: z.uuid(),
    kind: PomodoroKindSchema,
    taskId: z.uuid().nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    title: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.enum(["pause", "resume", "stop"]), id: z.uuid() }),
])

const getRoute = createRoute({
  method: "get",
  path: "/pomodoro",
  tags: ["Pomodoro"],
  summary: "Current timer and preferences",
  middleware: [requireAuth] as const,
  responses: {
    200: jsonContent(StateSchema, "Timer state"),
    401: { description: "Not signed in" },
  },
})
const actionRoute = createRoute({
  method: "post",
  path: "/pomodoro",
  tags: ["Pomodoro"],
  summary: "Start, pause, resume or stop a timer",
  middleware: [requireAuth] as const,
  request: { body: { required: true, content: { "application/json": { schema: ActionSchema } } } },
  responses: {
    200: jsonContent(StateSchema, "Updated timer"),
    401: { description: "Not signed in" },
    409: errorResponse("Another timer is active or the selected task/project is unavailable"),
  },
})
const settingsRoute = createRoute({
  method: "put",
  path: "/pomodoro/settings",
  tags: ["Pomodoro"],
  summary: "Save focus and break preferences",
  middleware: [requireAuth] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: PomodoroSettingsSchema } } },
  },
  responses: {
    200: jsonContent(StateSchema, "Saved preferences; active timer duration is unchanged"),
    401: { description: "Not signed in" },
  },
})

const TimezoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value })
      return true
    } catch {
      return false
    }
  }, "Use a valid IANA timezone")
const AnalyticsQuery = z
  .object({ from: IsoDateSchema, to: IsoDateSchema, timezone: TimezoneSchema })
  .refine(
    ({ from, to }) => daysBetween(from, to) >= 0 && daysBetween(from, to) < 366,
    "Choose a date range of 1–366 days",
  )
const AnalyticsSchema = z
  .object({
    series: z.array(
      z.object({
        date: IsoDateSchema,
        seconds: z.number(),
        completed: z.number(),
        interrupted: z.number(),
      }),
    ),
    summary: z.object({
      seconds: z.number(),
      completed: z.number(),
      interrupted: z.number(),
      activeDays: z.number(),
    }),
    today: z.object({ seconds: z.number(), completed: z.number() }),
    streak: z.number(),
    projects: z.array(z.object({ name: z.string(), seconds: z.number(), completed: z.number() })),
    sessions: z.array(SessionSchema),
  })
  .openapi("PomodoroAnalytics")
const analyticsRoute = createRoute({
  method: "get",
  path: "/pomodoro/analytics",
  tags: ["Pomodoro"],
  summary: "Daily focus history in your timezone",
  description:
    "Focus time includes stopped sessions and excludes breaks and pauses. Each session is credited to its finish date. History contains the latest 50 focus sessions in the range.",
  middleware: [requireAuth] as const,
  request: { query: AnalyticsQuery },
  responses: {
    200: jsonContent(AnalyticsSchema, "Focus analytics"),
    401: { description: "Not signed in" },
  },
})

/** Lock the owner row so concurrent tabs/devices cannot start or change timers out of order. */
function withTimer<A>(
  userId: string,
  run: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0], now: Date) => Promise<A>,
) {
  return runtime.runPromise(
    Db.use((service) =>
      service.query((db) =>
        db.transaction(async (tx) => {
          await tx
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .for("update")
          const now = new Date()
          await settleTimer(tx, userId, now)
          return run(tx, now)
        }),
      ),
    ),
  )
}

export const pomodoroRoutes = createRouter()
  .openapi(getRoute, async (c) => {
    const userId = c.get("user").id
    return c.json(await withTimer(userId, (tx, now) => timerState(tx, userId, now)), 200)
  })
  .openapi(actionRoute, async (c) => {
    const userId = c.get("user").id
    const input = c.req.valid("json")
    const result = await withTimer(userId, async (tx, now) => {
      const error = await changeTimer(tx, userId, input, now)
      return error ? { error } : { state: await timerState(tx, userId, now) }
    })
    return "error" in result ? c.json({ error: result.error }, 409) : c.json(result.state, 200)
  })
  .openapi(settingsRoute, async (c) => {
    const userId = c.get("user").id
    const input = c.req.valid("json")
    const result = await withTimer(userId, async (tx, now) => {
      await tx
        .insert(schema.pomodoroSettings)
        .values({ userId, ...input })
        .onConflictDoUpdate({ target: schema.pomodoroSettings.userId, set: input })
      return timerState(tx, userId, now)
    })
    return c.json(result, 200)
  })
  .openapi(analyticsRoute, async (c) => {
    const userId = c.get("user").id
    const input = c.req.valid("query")
    const result = await withTimer(userId, async (tx, now) => {
      const rows = await tx
        .select()
        .from(schema.pomodoroSession)
        .where(
          and(
            eq(schema.pomodoroSession.userId, userId),
            eq(schema.pomodoroSession.kind, "focus"),
            inArray(schema.pomodoroSession.status, ["completed", "interrupted"]),
          ),
        )
      return focusAnalytics(rows, { ...input, today: dateInTimezone(now, input.timezone) })
    })
    return c.json(result, 200)
  })
