import { Label } from "@cockpit/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cockpit/ui/components/select"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { parseResponse } from "hono/client"
import { useId, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import { authClient } from "~/lib/auth-client"
import { authErrorMessage, unwrap } from "~/lib/auth-errors"
import {
  currencyOptions,
  financeKey,
  settingsQueryOptions,
  type Currency,
  type Settings,
} from "~/lib/finance"
import { sessionQueryOptions } from "~/lib/session"

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQueryOptions),
  head: () => ({ meta: [{ title: "Settings · Cockpit" }] }),
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <header className="grid gap-3">
        <h1 className="font-display text-display-md sm:text-display-xl">Settings</h1>
        <p className="text-body-lg text-body">Your profile and how Cockpit shows things.</p>
      </header>
      <ProfileSection />
      <CurrencySection />
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-6 rounded-xl bg-canvas p-6 sm:p-8">
      <header className="grid gap-1">
        <h2 className="text-display-xs">{title}</h2>
        <p className="text-body-sm text-body">{description}</p>
      </header>
      {children}
    </section>
  )
}

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "What should we call you?")
    .max(80, "Keep it under 80 characters."),
})

function ProfileSection() {
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQueryOptions)
  const user = session!.user

  const update = useMutation({
    mutationFn: (values: z.infer<typeof profileSchema>) =>
      unwrap(authClient.updateUser({ name: values.name.trim() })),
    onSuccess: async () => {
      await queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 })
      toast.success("Profile saved")
    },
  })

  const form = useAppForm({
    defaultValues: { name: user.name },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: profileSchema },
    onSubmit: async ({ value }) => {
      await update.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <Section title="Profile" description="How you appear around Cockpit.">
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {update.error ? <FormAlert>{authErrorMessage(update.error)}</FormAlert> : null}
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" autoComplete="name" />}
        </form.AppField>
        <div className="grid gap-2">
          <Label>Email</Label>
          <p className="text-body-md text-body">{user.email}</p>
        </div>
        <form.AppForm>
          <form.SubmitButton
            pendingLabel="Saving…"
            pending={update.isPending}
            className="justify-self-start sm:w-auto"
          >
            Save profile
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </Section>
  )
}

function CurrencySection() {
  const queryClient = useQueryClient()
  const { data: settings } = useSuspenseQuery(settingsQueryOptions)

  const update = useMutation({
    mutationFn: (patch: Partial<Settings>) => parseResponse(api.settings.$patch({ json: patch })),
    // Optimistic: the select should never snap back while the request is in flight.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryOptions.queryKey })
      const previous = queryClient.getQueryData(settingsQueryOptions.queryKey)
      queryClient.setQueryData(settingsQueryOptions.queryKey, (old) => old && { ...old, ...patch })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(settingsQueryOptions.queryKey, context?.previous)
      toast.error("Couldn't save that. Try again.")
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(settingsQueryOptions.queryKey, saved)
      await queryClient.invalidateQueries({ queryKey: financeKey })
      toast.success("Saved")
    },
  })

  return (
    <Section
      title="Currencies"
      description="Add transactions in any currency. Cockpit converts them at each day's exchange rate."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <CurrencyField
          label="Show amounts in"
          hint="Totals, charts and lists are converted to this."
          value={settings.displayCurrency}
          onChange={(displayCurrency) => update.mutate({ displayCurrency })}
        />
        <CurrencyField
          label="New transactions in"
          hint="Preselected when you add a transaction."
          value={settings.defaultCurrency}
          onChange={(defaultCurrency) => update.mutate({ defaultCurrency })}
        />
      </div>
    </Section>
  )
}

function CurrencyField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: Currency
  onChange: (value: Currency) => void
}) {
  const id = useId()
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
        <SelectTrigger id={id} className="w-full" aria-describedby={`${id}-hint`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          {currencyOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-body-sm text-mute">
        {hint}
      </p>
    </div>
  )
}
