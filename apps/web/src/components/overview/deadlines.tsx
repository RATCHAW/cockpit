import { cn } from "@cockpit/ui/lib/utils"
import { Link } from "@tanstack/react-router"

import { CardHeader } from "~/components/overview/card-header"
import { formatShortDate, relativeDays, type Project } from "~/lib/projects"

const MAX_ROWS = 4

/** Active projects with a target date, nearest first. Hidden when none have one. */
export function Deadlines({ projects, today }: { projects: Project[]; today: string }) {
  const dated = projects
    .filter((p) => p.status === "active" && p.targetDate !== null)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))
  if (dated.length === 0) return null

  return (
    <section
      className="grid content-start gap-4 rounded-xl bg-canvas-soft p-6"
      aria-labelledby="deadlines-title"
    >
      <CardHeader id="deadlines-title" title="Deadlines" to="/projects" linkLabel="Open projects" />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {dated.slice(0, MAX_ROWS).map((project) => {
          const overdue = project.targetDate! < today
          return (
            <li key={project.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-3 transition-colors duration-150 ease-out hover:bg-wise-green-pale/40 focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas-soft text-xl"
                  aria-hidden
                >
                  {project.emoji}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-body-sm font-semibold">{project.name}</span>
                  <span className="truncate text-body-sm text-body">
                    {formatShortDate(project.targetDate!, today)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-body-sm font-semibold tabular-nums",
                    overdue && "text-negative-darkest",
                  )}
                >
                  {relativeDays(project.targetDate!, today)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
