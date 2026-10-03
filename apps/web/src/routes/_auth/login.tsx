import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { AuthCard } from "~/components/auth-card"
import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { authClient } from "~/lib/auth-client"
import { authErrorMessage, unwrap } from "~/lib/auth-errors"
import { loginSchema } from "~/lib/schemas"
import { safeRedirect, sessionQueryOptions } from "~/lib/session"

export const Route = createFileRoute("/_auth/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({ meta: [{ title: "Log in · Cockpit" }] }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const login = useMutation({
    mutationFn: (values: z.infer<typeof loginSchema>) =>
      unwrap(authClient.signIn.email({ ...values, rememberMe: true })),
    onSuccess: async () => {
      // Not invalidateQueries: nothing observes the session here, so it wouldn't refetch, and
      // the guard's ensureQueryData would keep returning the cached `null`.
      await queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 })
      await navigate({ to: safeRedirect(redirect), replace: true })
    },
  })

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: loginSchema },
    onSubmit: async ({ value }) => {
      await login.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <AuthCard title="Welcome back" description="Log in to pick up where you left off.">
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {login.error ? <FormAlert>{authErrorMessage(login.error)}</FormAlert> : null}

        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              autoFocus
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => <field.PasswordField label="Password" autoComplete="current-password" />}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Logging in…" pending={login.isPending}>
            Log in
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </AuthCard>
  )
}
