import { Button } from "@cockpit/ui/components/button"
import { Input } from "@cockpit/ui/components/input"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cockpit/ui/components/tabs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { parseResponse } from "hono/client"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  LightbulbIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { IdeaDialog } from "~/components/ideas/idea-dialog"
import { api } from "~/lib/api"
import { ideasQueryOptions, type Idea } from "~/lib/ideas"

export const Route = createFileRoute("/_app/ideas")({
  loader: ({ context }) => context.queryClient.prefetchQuery(ideasQueryOptions),
  head: () => ({ meta: [{ title: "Ideas · Cockpit" }] }),
  component: IdeasPage,
})

function IdeasPage() {
  const ideas = useQuery(ideasQueryOptions)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Idea | null>(null)
  const items = ideas.data?.items ?? []
  const query = search.trim().toLocaleLowerCase()
  const inbox = items.filter((idea) => !idea.archived)
  const archived = items.filter((idea) => idea.archived)

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <h1 className="font-display text-display-md sm:text-display-xl">Ideas</h1>
          <p className="text-body-md text-body">A place for the thoughts you don't want to lose.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          New idea
        </Button>
      </header>

      {ideas.isError ? (
        <div role="alert" className="grid justify-items-start gap-3 rounded-xl bg-canvas-soft p-6">
          <p className="text-body-sm text-body">Couldn't load your ideas. Try again.</p>
          <Button variant="outline" onClick={() => void ideas.refetch()}>
            Retry
          </Button>
        </div>
      ) : !ideas.data ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading ideas">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl bg-canvas-soft" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="inbox" className="gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <TabsList aria-label="Idea collection">
              <TabsTrigger value="inbox">Inbox · {inbox.length}</TabsTrigger>
              <TabsTrigger value="archived">Archived · {archived.length}</TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-64">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-4 left-4 size-4 text-mute"
              />
              <Input
                type="search"
                aria-label="Search ideas"
                placeholder="Search ideas"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <TabsContent value="inbox">
            <IdeaList
              items={inbox}
              query={query}
              archived={false}
              onEdit={setEditing}
              onCreate={() => setCreateOpen(true)}
            />
          </TabsContent>
          <TabsContent value="archived">
            <IdeaList
              items={archived}
              query={query}
              archived
              onEdit={setEditing}
              onCreate={() => setCreateOpen(true)}
            />
          </TabsContent>
        </Tabs>
      )}

      <IdeaDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing ? (
        <IdeaDialog key={editing.id} open idea={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}

function IdeaList({
  items,
  query,
  archived,
  onEdit,
  onCreate,
}: {
  items: Idea[]
  query: string
  archived: boolean
  onEdit: (idea: Idea) => void
  onCreate: () => void
}) {
  const visible = items.filter((idea) => idea.content.toLocaleLowerCase().includes(query))
  if (visible.length === 0) {
    return (
      <section className="grid justify-items-start gap-5 rounded-xl bg-canvas-soft p-8">
        <LightbulbIcon aria-hidden className="size-8 text-body" />
        <div className="grid gap-2">
          <h2 className="text-display-xs">
            {query
              ? "No matching ideas"
              : archived
                ? "Nothing archived yet"
                : "It starts with a thought"}
          </h2>
          <p className="max-w-lg text-body-md text-body">
            {query
              ? "Try a different word or check the other collection."
              : archived
                ? "Ideas you archive will stay here. Restore them whenever you like."
                : "A rough thought, a wild what-if, something to try. Save it now and come back when you're ready."}
          </p>
        </div>
        {!query && !archived ? (
          <Button onClick={onCreate}>
            <PlusIcon />
            Save your first idea
          </Button>
        ) : null}
      </section>
    )
  }
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      {visible.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} onEdit={() => onEdit(idea)} />
      ))}
    </div>
  )
}

function IdeaCard({ idea, onEdit }: { idea: Idea; onEdit: () => void }) {
  const queryClient = useQueryClient()
  const archive = useMutation({
    mutationFn: () =>
      parseResponse(
        api.ideas[":id"].$patch({
          param: { id: idea.id },
          json: { archived: !idea.archived },
        }),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(ideasQueryOptions.queryKey, (data) =>
        data
          ? {
              items: data.items.map((item) => (item.id === saved.id ? saved : item)),
            }
          : undefined,
      )
      void queryClient.invalidateQueries({ queryKey: ideasQueryOptions.queryKey })
      toast.success(saved.archived ? "Idea archived" : "Idea restored")
    },
    onError: () => toast.error("Couldn't move your idea. Try again."),
  })

  return (
    <article className="grid min-w-0 gap-6 rounded-xl bg-canvas-soft p-6">
      <p className="text-body-md leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
        {idea.content}
      </p>
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <time
          dateTime={idea.createdAt}
          title={new Date(idea.createdAt).toLocaleString()}
          className="text-caption text-mute"
        >
          {new Date(idea.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </time>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={archive.isPending}>
            <PencilIcon />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => archive.mutate()}
            disabled={archive.isPending}
          >
            {idea.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {idea.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      </footer>
    </article>
  )
}
