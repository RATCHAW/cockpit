import { Button } from "@cockpit/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cockpit/ui/components/dialog"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import {
  refreshProjectsAndTasks,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Project,
  type Task,
  type TaskStatus,
} from "~/lib/projects"

export type TaskDialogState =
  { mode: "create"; projectId?: string | null; status?: TaskStatus } | { mode: "edit"; task: Task }

const NO_PROJECT = "none"

const formSchema = z.object({
  title: z.string().trim().min(1, "What needs doing?").max(200, "Keep it under 200 characters."),
  notes: z.string().max(5000, "Keep it under 5,000 characters."),
  projectId: z.string(),
  status: z.enum(TASK_STATUSES),
  dueDate: z.union([z.literal(""), z.iso.date("Pick a valid date.")]),
})

type FormValues = z.infer<typeof formSchema>

const statusOptions = TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABELS[value] }))

function initialValues(state: TaskDialogState): FormValues {
  if (state.mode === "create") {
    return {
      title: "",
      notes: "",
      projectId: state.projectId ?? NO_PROJECT,
      status: state.status ?? "todo",
      dueDate: "",
    }
  }
  const t = state.task
  return {
    title: t.title,
    notes: t.notes ?? "",
    projectId: t.projectId ?? NO_PROJECT,
    status: t.status,
    dueDate: t.dueDate ?? "",
  }
}

export function TaskDialog({
  state,
  projects,
  onClose,
}: {
  state: TaskDialogState | null
  projects: Project[]
  onClose: () => void
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>{state.mode === "create" ? "Add a task" : "Edit task"}</DialogTitle>
            </DialogHeader>
            <TaskForm state={state} projects={projects} onDone={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TaskForm({
  state,
  projects,
  onDone,
}: {
  state: TaskDialogState
  projects: Project[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const refresh = () => refreshProjectsAndTasks(queryClient)

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const fields = {
        title: values.title.trim(),
        notes: values.notes.trim() || null,
        projectId: values.projectId === NO_PROJECT ? null : values.projectId,
        status: values.status,
        dueDate: values.dueDate || null,
      }
      if (state.mode === "edit") {
        await parseResponse(api.tasks[":id"].$patch({ param: { id: state.task.id }, json: fields }))
        return "Task updated"
      }
      await parseResponse(api.tasks.$post({ json: fields }))
      return "Task added"
    },
    onSuccess: async (message) => {
      await refresh()
      toast.success(message)
      onDone()
    },
  })

  const remove = useMutation({
    mutationFn: async (t: Task) => {
      await parseResponse(api.tasks[":id"].$delete({ param: { id: t.id } }))
      return t
    },
    onSuccess: async (t) => {
      onDone()
      await refresh()
      toast("Task deleted", {
        description: t.title,
        action: {
          label: "Undo",
          onClick: async () => {
            const { title, notes, projectId, status, position, dueDate } = t
            await parseResponse(
              api.tasks.$post({ json: { title, notes, projectId, status, position, dueDate } }),
            ).catch(() => toast.error("Couldn't restore it. Add it again manually."))
            await refresh()
          },
        },
      })
    },
    onError: () => toast.error("Couldn't delete it. Try again."),
  })

  const form = useAppForm({
    defaultValues: initialValues(state),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => {})
    },
  })

  // Done projects only show up if the task already belongs to one.
  const currentProject = state.mode === "edit" ? state.task.projectId : state.projectId
  const projectOptions = [
    { value: NO_PROJECT, label: "No project" },
    ...projects
      .filter((p) => p.status !== "done" || p.id === currentProject)
      .map((p) => ({ value: p.id, label: `${p.emoji}  ${p.name}` })),
  ]

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

      <form.AppField name="title">
        {(field) => (
          <field.TextField
            label="Task"
            autoComplete="off"
            placeholder="e.g. Go shopping, Renew passport"
            autoFocus={state.mode === "create"}
          />
        )}
      </form.AppField>

      <form.AppField name="notes">
        {(field) => (
          <field.TextareaField
            label="Notes"
            hint={<span className="text-body-sm text-mute">Optional</span>}
          />
        )}
      </form.AppField>

      <form.AppField name="projectId">
        {(field) => <field.SelectField label="Project" options={projectOptions} />}
      </form.AppField>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <form.AppField name="status">
          {(field) => <field.SelectField label="Column" options={statusOptions} />}
        </form.AppField>
        <form.AppField name="dueDate">
          {(field) => (
            <field.TextField
              label="Due"
              type="date"
              hint={<span className="text-body-sm text-mute">Optional</span>}
            />
          )}
        </form.AppField>
      </div>

      <DialogFooter className="gap-3 pt-1 sm:items-center sm:justify-between">
        {state.mode === "edit" ? (
          <Button
            type="button"
            variant="ghost"
            className="text-negative-darkest"
            disabled={remove.isPending}
            onClick={() => remove.mutate(state.task)}
          >
            <Trash2Icon />
            Delete
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            {state.mode === "create" ? "Add task" : "Save changes"}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
