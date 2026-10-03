/**
 * Project, habit and task constants shared by the API and the web app (`@cockpit/api/projects`).
 * Keep this file free of server-only imports — it ends up in the browser bundle.
 */

export const PROJECT_STATUSES = ["active", "paused", "done"] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const HABIT_CADENCES = ["daily", "weekly"] as const
export type HabitCadence = (typeof HABIT_CADENCES)[number]

export const TASK_STATUSES = ["todo", "doing", "done"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** How far back each habit's check-ins are returned with the project list. */
export const HABIT_HISTORY_WEEKS = 26
export const HABIT_HISTORY_DAYS = HABIT_HISTORY_WEEKS * 7

/** Suggestions in the project form. Any single emoji is accepted. */
export const PROJECT_EMOJIS = [
  "🏃",
  "💼",
  "💻",
  "🎓",
  "📚",
  "💪",
  "🧘",
  "🚀",
  "💰",
  "🏠",
  "✈️",
  "🎨",
  "🎸",
  "🌱",
  "🧠",
  "🗣️",
  "✍️",
  "📈",
  "🛠️",
  "❤️",
] as const
