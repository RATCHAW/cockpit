import { schema, type Database } from "@cockpit/db"
import { and, count, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm"

import { DEFAULT_POMODORO_SETTINGS, liveElapsedSeconds, plannedSeconds } from "../shared/pomodoro"
import type { PomodoroKind } from "../shared/pomodoro"

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type FocusSession = typeof schema.pomodoroSession.$inferSelect

export const sessionDto = (row: FocusSession) => ({
  ...row,
  startedAt: row.startedAt.toISOString(),
  resumedAt: row.resumedAt?.toISOString() ?? null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
})

const activeWhere = (userId: string) =>
  and(
    eq(schema.pomodoroSession.userId, userId),
    inArray(schema.pomodoroSession.status, ["running", "paused"]),
  )

const { plannedSeconds: planned, elapsedSeconds: elapsed, resumedAt } = schema.pomodoroSession
const deadline = sql<Date>`${resumedAt} + (${planned} - ${elapsed}) * interval '1 second'`

/** Completes an overdue countdown at its deadline. Flow sessions never end on their own. */
export async function settleTimer(tx: Transaction, userId: string, now: Date) {
  await tx
    .update(schema.pomodoroSession)
    .set({ status: "completed", elapsedSeconds: planned, finishedAt: deadline, resumedAt: null })
    .where(
      and(
        eq(schema.pomodoroSession.userId, userId),
        eq(schema.pomodoroSession.status, "running"),
        isNotNull(planned),
        lte(deadline, now),
      ),
    )
}

export async function timerState(tx: Transaction, userId: string, now: Date) {
  const [settings] = await tx
    .select()
    .from(schema.pomodoroSettings)
    .where(eq(schema.pomodoroSettings.userId, userId))
  const [current] = await tx.select().from(schema.pomodoroSession).where(activeWhere(userId))
  const recent = await tx
    .select()
    .from(schema.pomodoroSession)
    .where(
      and(
        eq(schema.pomodoroSession.userId, userId),
        inArray(schema.pomodoroSession.status, ["completed", "interrupted"]),
      ),
    )
    .orderBy(desc(schema.pomodoroSession.finishedAt))
    .limit(1)
  const [total] = await tx
    .select({ value: count() })
    .from(schema.pomodoroSession)
    .where(
      and(
        eq(schema.pomodoroSession.userId, userId),
        eq(schema.pomodoroSession.kind, "focus"),
        eq(schema.pomodoroSession.status, "completed"),
      ),
    )
  return {
    serverNow: now.toISOString(),
    settings: settings ?? DEFAULT_POMODORO_SETTINGS,
    current: current ? sessionDto(current) : null,
    lastSession: recent[0] ? sessionDto(recent[0]) : null,
    completedFocusCount: total?.value ?? 0,
  }
}

type TimerAction =
  | {
      action: "start"
      id: string
      kind: PomodoroKind
      taskId?: string | null
      projectId?: string | null
      title?: string
    }
  | { action: "pause" | "resume" | "stop"; id: string }

export async function changeTimer(tx: Transaction, userId: string, input: TimerAction, now: Date) {
  const [current] = await tx.select().from(schema.pomodoroSession).where(activeWhere(userId))
  if (input.action === "start") {
    const [existing] = await tx
      .select({ id: schema.pomodoroSession.id })
      .from(schema.pomodoroSession)
      .where(
        and(eq(schema.pomodoroSession.id, input.id), eq(schema.pomodoroSession.userId, userId)),
      )
    if (existing) return null
    if (current) return "A timer is already active. Pause or stop it first."

    let title = input.title?.trim() || (input.kind === "flow" ? "Flow session" : "Focus session")
    let projectId = input.projectId ?? null
    let taskId: string | null = null
    let projectName: string | null = null
    if (input.kind === "focus" || input.kind === "flow") {
      if (input.taskId) {
        const [task] = await tx
          .select()
          .from(schema.task)
          .where(and(eq(schema.task.id, input.taskId), eq(schema.task.userId, userId)))
        if (!task) return "That task is no longer available. Choose another task."
        title = task.title
        taskId = task.id
        projectId = task.projectId
      }
      if (projectId) {
        const [project] = await tx
          .select()
          .from(schema.project)
          .where(and(eq(schema.project.id, projectId), eq(schema.project.userId, userId)))
        if (!project) return "That project is no longer available. Choose another project."
        projectName = project.name
      }
    } else {
      title = input.kind === "short_break" ? "Short break" : "Long break"
      projectId = null
    }
    const [settings] = await tx
      .select()
      .from(schema.pomodoroSettings)
      .where(eq(schema.pomodoroSettings.userId, userId))
    const seconds = plannedSeconds(input.kind, settings ?? DEFAULT_POMODORO_SETTINGS)
    await tx.insert(schema.pomodoroSession).values({
      id: input.id,
      userId,
      kind: input.kind,
      status: "running",
      title,
      taskId,
      projectId,
      projectName,
      plannedSeconds: seconds,
      startedAt: now,
      resumedAt: now,
    })
    return null
  }

  // Repeated commands for a finished session are harmless. Never affect a newer timer.
  if (!current || current.id !== input.id) return null
  const where = eq(schema.pomodoroSession.id, current.id)
  const worked = liveElapsedSeconds(current, now.getTime())
  if (input.action === "pause" && current.status === "running") {
    await tx
      .update(schema.pomodoroSession)
      .set({ status: "paused", elapsedSeconds: worked, resumedAt: null })
      .where(where)
  } else if (input.action === "resume" && current.status === "paused") {
    await tx.update(schema.pomodoroSession).set({ status: "running", resumedAt: now }).where(where)
  } else if (input.action === "stop") {
    await tx
      .update(schema.pomodoroSession)
      .set({
        // Finishing is a flow's natural end; a countdown stopped early is an interruption.
        status: current.kind === "flow" ? "completed" : "interrupted",
        elapsedSeconds: worked,
        resumedAt: null,
        finishedAt: now,
      })
      .where(where)
  }
  return null
}
