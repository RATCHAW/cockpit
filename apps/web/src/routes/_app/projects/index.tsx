import { Button } from "@cockpit/ui/components/button"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { ProjectCard } from "~/components/projects/project-card"
import { ProjectDialog, type ProjectDialogState } from "~/components/projects/project-dialog"
import { TodayHabits } from "~/components/projects/today-habits"
import { projectsQueryOptions, type Project } from "~/lib/projects"

export const Route = createFileRoute("/_app/projects/")({
  loader: ({ context }) => context.queryClient.prefetchQuery(projectsQueryOptions()),
  head: () => ({ meta: [{ title: "Projects · Cockpit" }] }),
  component: ProjectsPage,
})

const EXAMPLES = ["🏃 Run a marathon", "💼 Land a first Upwork gig", "🎓 Pass a certification"]

function ProjectsPage() {
  const [dialog, setDialog] = useState<ProjectDialogState | null>(null)
  const projects = useQuery(projectsQueryOptions())
  const data = projects.data

  const groups = {
    active: data?.items.filter((p) => p.status === "active") ?? [],
    paused: data?.items.filter((p) => p.status === "paused") ?? [],
    done: data?.items.filter((p) => p.status === "done") ?? [],
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <h1 className="font-display text-display-md sm:text-display-xl">Projects</h1>
          <p className="text-body-md text-body">
            What you're working towards, and the habits that get you there.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <PlusIcon />
          New project
        </Button>
      </header>

      {projects.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-negative-bg p-4 text-body-sm font-semibold text-white"
        >
          Couldn't load your projects. Try again in a moment.
        </p>
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl bg-canvas-soft" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <section className="grid justify-items-start gap-6 rounded-xl bg-canvas-soft p-8">
          <div className="grid gap-2">
            <h2 className="text-display-xs">Start with one thing</h2>
            <p className="max-w-lg text-body-md text-body">
              A project is anything you're putting time into. Give it habits to keep at it, and
              tasks for the one-off steps.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <li key={example} className="rounded-full bg-canvas px-3 py-1 text-body-sm">
                {example}
              </li>
            ))}
          </ul>
          <Button onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            Create a project
          </Button>
        </section>
      ) : (
        <>
          <TodayHabits data={data} />
          <ProjectGrid items={groups.active} today={data.today} />
          {groups.paused.length > 0 ? (
            <ProjectGrid title="Paused" items={groups.paused} today={data.today} />
          ) : null}
          {groups.done.length > 0 ? (
            <ProjectGrid title="Done" items={groups.done} today={data.today} />
          ) : null}
        </>
      )}

      <ProjectDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  )
}

function ProjectGrid({ title, items, today }: { title?: string; items: Project[]; today: string }) {
  if (items.length === 0) return null
  return (
    <section className="grid gap-4" aria-label={title ?? "Active projects"}>
      {title ? <h2 className="text-display-xs">{title}</h2> : null}
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((project) => (
          <ProjectCard key={project.id} project={project} today={today} />
        ))}
      </div>
    </section>
  )
}
