import { eq, sql } from "drizzle-orm"
import { seed } from "drizzle-seed"

import { pomodoroSession, pomodoroSettings, project } from "../../schema"
import type { Seeder } from "../types"

export const pomodoroSeeder: Seeder = {
  name: "pomodoro",
  run: async ({ db, admin }) => {
    const [existing] = await db
      .select({ id: pomodoroSession.id })
      .from(pomodoroSession)
      .where(eq(pomodoroSession.userId, admin.id))
      .limit(1)
    if (existing) return
    await db.insert(pomodoroSettings).values({ userId: admin.id }).onConflictDoNothing()
    const projects = await db.select().from(project).where(eq(project.userId, admin.id))
    const now = new Date()
    const finishedDates = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now)
      date.setDate(date.getDate() - i - 1)
      date.setHours(12, 0, 0, 0)
      return date
    })
    await seed(db, { pomodoroSession }, { seed: 42 }).refine((f) => ({
      pomodoroSession: {
        count: 90,
        columns: {
          userId: f.default({ defaultValue: admin.id }),
          kind: f.default({ defaultValue: "focus" }),
          status: f.default({ defaultValue: "completed" }),
          taskId: f.default({ defaultValue: null }),
          projectId: f.default({ defaultValue: null }),
          title: f.valuesFromArray({
            values: ["Deep work", "Study session", "Plan the next step", "Review and reflect"],
          }),
          projectName: f.valuesFromArray({
            values: projects.length ? projects.map((p) => p.name) : ["Personal"],
          }),
          plannedSeconds: f.default({ defaultValue: 1500 }),
          elapsedSeconds: f.default({ defaultValue: 1500 }),
          startedAt: f.default({ defaultValue: new Date(finishedDates[29]!.getTime() - 1500_000) }),
          endsAt: f.default({ defaultValue: null }),
          finishedAt: f.date({ minDate: finishedDates[29], maxDate: finishedDates[0] }),
        },
      },
    }))
    // Keep each fixture's start and finish consistent while preserving the generated daily spread.
    await db
      .update(pomodoroSession)
      .set({
        startedAt: sql`${pomodoroSession.finishedAt} - ${pomodoroSession.plannedSeconds} * interval '1 second'`,
      })
      .where(eq(pomodoroSession.userId, admin.id))
  },
}
