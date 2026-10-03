import { revalidateLogic } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { z } from "zod"

import { AuthCard } from "~/components/auth-card"
import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { authClient } from "~/lib/auth-client"
import { authErrorMessage, unwrap } from "~/lib/auth-errors"
import { forgotPasswordSchema } from "~/lib/schemas"

export const Route = createFileRoute("/_auth/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password · Cockpit" }] }),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const request = useMutation({
    mutationFn: (values: z.infer<typeof forgotPasswordSchema>) =>
      unwrap(
        authClient.requestPasswordReset({
          email: values.email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      ),
  })

  const form = useAppForm({
    defaultValues: { email: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      await request.mutateAsync(value).catch(() => {})
    },
  })

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to choose a new one."
      footer={
        <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
          Back to log in
        </Link>
      }
    >
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {request.isSuccess ? (
          <FormAlert tone="positive">
            If an account exists for {request.variables.email}, a reset link is on its way.
          </FormAlert>
        ) : null}
        {request.error ? <FormAlert>{authErrorMessage(request.error)}</FormAlert> : null}

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

        <form.AppForm>
          <form.SubmitButton pendingLabel="Sending link…" pending={request.isPending}>
            Send reset link
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </AuthCard>
  )
}
