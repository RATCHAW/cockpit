import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cockpit/ui/components/dialog"
import { Tabs, TabsList, TabsTrigger } from "@cockpit/ui/components/tabs"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import { HABIT_CADENCES, projectsKey, type Habit, type HabitCadence } from "~/lib/projects"

export type HabitDialogState =
  { mode: "create"; projectId: string; projectName: string } | { mode: "edit"; habit: Habit }

const formSchema = z.object({
  name: z.string().trim().min(1, "What will you do?").max(80, "Keep it under 80 characters."),
  cadence: z.enum(HABIT_CADENCES),
  target: z.string(),
})

type FormValues = z.infer<typeof formSchema>

const targetOptions = Array.from({ length: 7 }, (_, i) => ({
  value: String(i + 1),
  label: i === 0 ? "Once a week" : `${i + 1} days a week`,
}))

export function HabitDialog({
  state,
  onClose,
}: {
  state: HabitDialogState | null
  onClose: () => void
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>{state.mode === "create" ? "Add a habit" : "Edit habit"}</DialogTitle>
              {state.mode === "create" ? (
                <DialogDescription>
                  A small thing you do regularly to move {state.projectName} forward.
                </DialogDescription>
              ) : null}
            </DialogHeader>
            <HabitForm state={state} onDone={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function HabitForm({ state, onDone }: { state: HabitDialogState; onDone: () => void }) {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const fields = {
        name: values.name.trim(),
        cadence: values.cadence,
        target: values.cadence === "daily" ? 1 : Number(values.target),
      }
      if (state.mode === "edit") {
        await parseResponse(
          api.habits[":id"].$patch({ param: { id: state.habit.id }, json: fields }),
        )
        return "Habit updated"
      }
      await parseResponse(api.habits.$post({ json: { ...fields, projectId: state.projectId } }))
      return "Habit added"
    },
    onSuccess: async (message) => {
      await queryClient.invalidateQueries({ queryKey: projectsKey })
      toast.success(message)
      onDone()
    },
  })

  const form = useAppForm({
    defaultValues: (state.mode === "edit"
      ? {
          name: state.habit.name,
          cadence: state.habit.cadence,
          target: String(state.habit.cadence === "weekly" ? state.habit.target : 3),
        }
      : { name: "", cadence: "daily", target: "3" }) satisfies FormValues as FormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => {})
    },
  })

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

      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label="Habit"
            autoComplete="off"
            placeholder="e.g. Send one proposal, Go for a run"
            autoFocus={state.mode === "create"}
          />
        )}
      </form.AppField>

      <form.Field name="cadence">
        {(field) => (
          <Tabs
            value={field.state.value}
            onValueChange={(v) => field.handleChange(v as HabitCadence)}
          >
            <TabsList className="w-full" aria-label="How often">
              <TabsTrigger value="daily">Every day</TabsTrigger>
              <TabsTrigger value="weekly">Some days a week</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.cadence}>
        {(cadence) =>
          cadence === "weekly" ? (
            <form.AppField name="target">
              {(field) => <field.SelectField label="How many days" options={targetOptions} />}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>

      <DialogFooter className="pt-1">
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            {state.mode === "create" ? "Add habit" : "Save changes"}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
