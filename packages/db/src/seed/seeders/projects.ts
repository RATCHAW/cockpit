import { eq } from "drizzle-orm"

import { habit, habitCheckin, project, task } from "../../schema"
import type { Seeder } from "../types"

const iso = (date: Date) => date.toISOString().slice(0, 10)
const daysFromNow = (days: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}

/** Deterministic PRNG (mulberry32) so every reseed produces the same history. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type HabitSeed = {
  name: string
  cadence: "daily" | "weekly"
  target?: number
  /** Chance of a check-in on any given day. */
  rate: number
  /** Recent days kept in a row, so there's a streak to show. */
  streak?: number
  /** How long ago the habit started. */
  since: number
}

type TaskSeed = {
  title: string
  status?: "todo" | "doing" | "done"
  notes?: string
  dueIn?: number
}

type ProjectSeed = {
  name: string
  emoji: string
  description?: string
  status?: "active" | "paused" | "done"
  targetIn?: number
  habits: HabitSeed[]
  tasks: TaskSeed[]
}

const projects: ProjectSeed[] = [
  {
    name: "Run a marathon",
    emoji: "🏃",
    description: "Finish the Marrakech marathon under 4 hours. Build up slowly, don't get injured.",
    targetIn: 112,
    habits: [
      { name: "Training run", cadence: "weekly", target: 4, rate: 0.6, since: 90 },
      { name: "Stretch for 10 minutes", cadence: "daily", rate: 0.55, streak: 4, since: 60 },
    ],
    tasks: [
      { title: "Buy new running shoes", status: "doing", dueIn: 5 },
      { title: "Register for the race", status: "done" },
      { title: "Plan the 16-week training block", status: "done" },
      { title: "Book a sports massage", dueIn: 14 },
      { title: "Try energy gels on a long run" },
    ],
  },
  {
    name: "Land a first Upwork gig",
    emoji: "💼",
    description: "One proposal a day until the first client says yes.",
    targetIn: 45,
    habits: [{ name: "Send one proposal", cadence: "daily", rate: 0.7, streak: 9, since: 40 }],
    tasks: [
      { title: "Rewrite profile headline and overview", status: "done" },
      {
        title: "Add two case studies to the portfolio",
        status: "doing",
        notes: "The Cockpit dashboard and the booking app. Screenshots + a short write-up each.",
      },
      { title: "Record a 60-second intro video", dueIn: 7 },
      { title: "Take the Upwork readiness test", dueIn: -2 },
    ],
  },
  {
    name: "Day job",
    emoji: "💻",
    description: "Things to keep moving at work.",
    habits: [],
    tasks: [
      { title: "Review the payments PR", status: "doing", dueIn: 0 },
      { title: "Write the Q4 migration plan", dueIn: 10 },
      { title: "Prepare 1:1 notes" },
      { title: "Fix flaky checkout test", status: "done" },
    ],
  },
  {
    name: "AWS Solutions Architect",
    emoji: "🎓",
    description: "Associate certification.",
    targetIn: 75,
    habits: [{ name: "Study for 30 minutes", cadence: "weekly", target: 5, rate: 0.5, since: 30 }],
    tasks: [
      { title: "Book the exam slot", dueIn: 20 },
      { title: "Finish the networking module" },
      { title: "Buy the practice exam pack", status: "done" },
    ],
  },
  {
    name: "Learn Spanish",
    emoji: "🗣️",
    status: "paused",
    habits: [{ name: "Duolingo lesson", cadence: "daily", rate: 0.4, since: 120 }],
    tasks: [],
  },
]

const standalone: TaskSeed[] = [
  { title: "Go shopping", dueIn: 1 },
  { title: "Renew passport", notes: "Bring two photos and the old passport.", dueIn: 30 },
  { title: "Call the bank about the card" },
  { title: "Fix the bike's back brake", status: "doing" },
  { title: "Pay the electricity bill", status: "done" },
]

/** Five projects with habits and half a year of check-ins, plus a few standalone tasks. */
export const projectsSeeder: Seeder = {
  name: "projects",
  run: async ({ db, admin }) => {
    const [existing] = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.userId, admin.id))
      .limit(1)
    if (existing) {
      console.log("    already has projects, skipping")
      return
    }

    const rand = random(42)
    const positions = { todo: 0, doing: 0, done: 0 }
    const taskRow = (t: TaskSeed, projectId: string | null) => {
      const status = t.status ?? "todo"
      return {
        userId: admin.id,
        projectId,
        title: t.title,
        notes: t.notes ?? null,
        status,
        position: positions[status]++,
        dueDate: t.dueIn === undefined ? null : daysFromNow(t.dueIn),
        completedAt: status === "done" ? new Date(Date.now() - rand() * 7 * 86_400_000) : null,
      }
    }

    let checkinCount = 0
    let taskCount = 0
    for (const p of projects) {
      const [row] = await db
        .insert(project)
        .values({
          userId: admin.id,
          name: p.name,
          emoji: p.emoji,
          description: p.description ?? null,
          status: p.status ?? "active",
          targetDate: p.targetIn === undefined ? null : daysFromNow(p.targetIn),
        })
        .returning({ id: project.id })

      for (const h of p.habits) {
        const [habitRow] = await db
          .insert(habit)
          .values({
            userId: admin.id,
            projectId: row!.id,
            name: h.name,
            cadence: h.cadence,
            target: h.target ?? 1,
          })
          .returning({ id: habit.id })

        // Today is left open so there's something to check off.
        const dates: string[] = []
        for (let ago = h.since; ago >= 1; ago--) {
          const inStreak = h.streak !== undefined && ago <= h.streak
          const lapsed = p.status === "paused" && ago < 30
          if (!lapsed && (inStreak || rand() < h.rate)) dates.push(daysFromNow(-ago))
        }
        if (dates.length > 0) {
          await db
            .insert(habitCheckin)
            .values(dates.map((date) => ({ habitId: habitRow!.id, date })))
          checkinCount += dates.length
        }
      }

      if (p.tasks.length > 0) {
        await db.insert(task).values(p.tasks.map((t) => taskRow(t, row!.id)))
        taskCount += p.tasks.length
      }
    }

    await db.insert(task).values(standalone.map((t) => taskRow(t, null)))
    taskCount += standalone.length

    console.log(`    ${projects.length} projects, ${checkinCount} check-ins, ${taskCount} tasks`)
  },
}
