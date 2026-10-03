import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cockpit/ui/components/dialog"
import { Label } from "@cockpit/ui/components/label"
import { cn } from "@cockpit/ui/lib/utils"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { parseResponse } from "hono/client"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import {
  PROJECT_EMOJIS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  refreshProjectsAndTasks,
  type Project,
} from "~/lib/projects"

export type ProjectDialogState = { mode: "create" } | { mode: "edit"; project: Project }

const formSchema = z.object({
  emoji: z.string().min(1, "Pick an emoji."),
  name: z.string().trim().min(1, "Give it a name.").max(80, "Keep it under 80 characters."),
  description: z.string().max(500, "Keep it under 500 characters."),
  targetDate: z.union([z.literal(""), z.iso.date("Pick a valid date.")]),
  status: z.enum(PROJECT_STATUSES),
})

type FormValues = z.infer<typeof formSchema>

const statusOptions = PROJECT_STATUSES.map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}))

function initialValues(state: ProjectDialogState): FormValues {
  if (state.mode === "create") {
    return { emoji: PROJECT_EMOJIS[0], name: "", description: "", targetDate: "", status: "active" }
  }
  const p = state.project
  return {
    emoji: p.emoji,
    name: p.name,
    description: p.description ?? "",
    targetDate: p.targetDate ?? "",
    status: p.status,
  }
}

export function ProjectDialog({
  state,
  onClose,
}: {
  state: ProjectDialogState | null
  onClose: () => void
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>{state.mode === "create" ? "New project" : "Edit project"}</DialogTitle>
              {state.mode === "create" ? (
                <DialogDescription>
                  Something you're working towards: a race, a job, a certification, a first client.
                </DialogDescription>
              ) : null}
            </DialogHeader>
            <ProjectForm state={state} onDone={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ProjectForm({ state, onDone }: { state: ProjectDialogState; onDone: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const fields = {
        emoji: values.emoji,
        name: values.name.trim(),
        description: values.description.trim() || null,
        targetDate: values.targetDate || null,
      }
      if (state.mode === "edit") {
        return parseResponse(
          api.projects[":id"].$patch({
            param: { id: state.project.id },
            json: { ...fields, status: values.status },
          }),
        )
      }
      return parseResponse(api.projects.$post({ json: fields }))
    },
    onSuccess: async (project) => {
      await refreshProjectsAndTasks(queryClient)
      onDone()
      if (state.mode === "create") {
        toast.success(`${project.emoji} ${project.name} created`)
        await navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
      } else {
        toast.success("Project updated")
      }
    },
  })

  const form = useAppForm({
    defaultValues: initialValues(state),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => {})
    },
  })

  // Keep a custom emoji from an older project selectable alongside the suggestions.
  const current = state.mode === "edit" ? state.project.emoji : undefined
  const emojis =
    current && !(PROJECT_EMOJIS as readonly string[]).includes(current)
      ? [current, ...PROJECT_EMOJIS]
      : PROJECT_EMOJIS

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {save.error ? (
        <FormAlert>Couldn't save that. Check your connection and try again.</FormAlert>
      ) : null}

      <form.Field name="emoji">
        {(field) => (
          <fieldset className="grid gap-2">
            <Label asChild>
              <legend>Icon</legend>
            </Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
              {emojis.map((emoji) => {
                const selected = field.state.value === emoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={emoji}
                    onClick={() => field.handleChange(emoji)}
                    className={cn(
                      "grid size-10 place-items-center rounded-md text-xl transition-[background-color,box-shadow] duration-150 ease-out",
                      "hover:bg-canvas-soft focus-visible:ring-[3px] focus-visible:ring-ink/15 focus-visible:outline-none",
                      selected && "bg-canvas-soft ring-2 ring-ink hover:bg-canvas-soft",
                    )}
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}
      </form.Field>

      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label="Name"
            autoComplete="off"
            placeholder="e.g. Run a marathon, Land a first Upwork gig"
            autoFocus={state.mode === "create"}
          />
        )}
      </form.AppField>

      <form.AppField name="description">
        {(field) => (
          <field.TextareaField
            label="Why it matters"
            placeholder="What does done look like?"
            hint={<span className="text-body-sm text-mute">Optional</span>}
          />
        )}
      </form.AppField>

      <div className={cn("grid gap-5", state.mode === "edit" && "sm:grid-cols-2 sm:gap-3")}>
        <form.AppField name="targetDate">
          {(field) => (
            <field.TextField
              label="Target date"
              type="date"
              hint={<span className="text-body-sm text-mute">Optional</span>}
            />
          )}
        </form.AppField>
        {state.mode === "edit" ? (
          <form.AppField name="status">
            {(field) => <field.SelectField label="Status" options={statusOptions} />}
          </form.AppField>
        ) : null}
      </div>

      <DialogFooter className="pt-1">
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            {state.mode === "create" ? "Create project" : "Save changes"}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
