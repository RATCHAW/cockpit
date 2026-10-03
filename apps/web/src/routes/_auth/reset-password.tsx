import { Button } from "@cockpit/ui/components/button"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"

import { AuthCard } from "~/components/auth-card"
import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { authClient } from "~/lib/auth-client"
import { authErrorMessage, unwrap } from "~/lib/auth-errors"
import { resetPasswordSchema } from "~/lib/schemas"

export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.string().optional(),
  }),
  head: () => ({ meta: [{ title: "Choose a new password · Cockpit" }] }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token, error } = Route.useSearch()

  if (!token || error) {
    return (
      <AuthCard
        title="Link expired"
        description="This reset link is invalid or has already been used. Request a new one."
      >
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    )
  }

  return <ResetPasswordForm token={token} />
}

function ResetPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate()

  const reset = useMutation({
    mutationFn: (newPassword: string) => unwrap(authClient.resetPassword({ newPassword, token })),
    onSuccess: async () => {
      toast.success("Password updated. Log in with your new password.")
      await navigate({ to: "/login", replace: true })
    },
  })

  const form = useAppForm({
    defaultValues: { password: "", confirm: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      await reset.mutateAsync(value.password).catch(() => {})
    },
  })

  return (
    <AuthCard title="Choose a new password" description="You'll be signed out everywhere else.">
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {reset.error ? <FormAlert>{authErrorMessage(reset.error)}</FormAlert> : null}

        <form.AppField name="password">
          {(field) => (
            <field.PasswordField
              label="New password"
              autoComplete="new-password"
              autoFocus
              hint={<span className="text-caption text-mute">12+ characters</span>}
            />
          )}
        </form.AppField>
        <form.AppField name="confirm">
          {(field) => <field.PasswordField label="Confirm password" autoComplete="new-password" />}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={reset.isPending}>
            Update password
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </AuthCard>
  )
}
