import { PomodoroSettingsSchema, type PomodoroSettings } from "@cockpit/api/pomodoro"
import { Button } from "@cockpit/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cockpit/ui/components/dialog"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import { pomodoroKey } from "~/lib/pomodoro"

const numberField = (min: number, max: number) =>
  z
    .string()
    .refine(
      (value) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max,
      `Choose a whole number from ${min} to ${max}.`,
    )
const formSchema = PomodoroSettingsSchema.extend({
  focusMinutes: numberField(1, 180),
  shortBreakMinutes: numberField(1, 60),
  longBreakMinutes: numberField(1, 60),
  longBreakEvery: numberField(2, 12),
  dailyGoal: numberField(1, 20),
})
const fields = [
  { name: "focusMinutes", label: "Focus (minutes)", min: 1, max: 180 },
  { name: "shortBreakMinutes", label: "Short break (minutes)", min: 1, max: 60 },
  { name: "longBreakMinutes", label: "Long break (minutes)", min: 1, max: 60 },
  { name: "longBreakEvery", label: "Sessions before a long break", min: 2, max: 12 },
  { name: "dailyGoal", label: "Daily goal (focus sessions)", min: 1, max: 20 },
] as const

export function PomodoroSettingsDialog({
  settings,
  onClose,
}: {
  settings: PomodoroSettings
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Make time your own</DialogTitle>
          <DialogDescription>
            Choose a rhythm that works for you. Changes apply to the next timer.
          </DialogDescription>
        </DialogHeader>
        <SettingsForm settings={settings} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({ settings, onClose }: { settings: PomodoroSettings; onClose: () => void }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: pomodoroKey }),
    mutationFn: (json: PomodoroSettings) => parseResponse(api.pomodoro.settings.$put({ json })),
    onSuccess: (state) => {
      queryClient.setQueryData(pomodoroKey, {
        ...state,
        clockOffset: Date.parse(state.serverNow) - Date.now(),
      })
      toast.success("Pomodoro settings saved")
      onClose()
    },
  })
  const form = useAppForm({
    defaultValues: {
      ...settings,
      focusMinutes: String(settings.focusMinutes),
      shortBreakMinutes: String(settings.shortBreakMinutes),
      longBreakMinutes: String(settings.longBreakMinutes),
      longBreakEvery: String(settings.longBreakEvery),
      dailyGoal: String(settings.dailyGoal),
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value }) => {
      await save
        .mutateAsync(
          PomodoroSettingsSchema.parse({
            ...value,
            focusMinutes: Number(value.focusMinutes),
            shortBreakMinutes: Number(value.shortBreakMinutes),
            longBreakMinutes: Number(value.longBreakMinutes),
            longBreakEvery: Number(value.longBreakEvery),
            dailyGoal: Number(value.dailyGoal),
          }),
        )
        .catch(() => {})
    },
  })
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {save.isError ? (
        <FormAlert>Couldn't save your settings. Check your connection and try again.</FormAlert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ name, label, min, max }) => (
          <form.AppField key={name} name={name}>
            {(field) => (
              <field.TextField
                label={label}
                type="number"
                min={min}
                max={max}
                step={1}
                inputMode="numeric"
              />
            )}
          </form.AppField>
        ))}
      </div>
      <form.Field name="soundEnabled">
        {(field) => (
          <label className="flex cursor-pointer items-center gap-3 py-2 text-body-sm font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={field.state.value}
              onChange={(event) => field.handleChange(event.target.checked)}
            />
            Play a sound when the timer finishes
          </label>
        )}
      </form.Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            Save settings
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
