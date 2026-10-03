import { Button } from "@cockpit/ui/components/button"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { z } from "zod"

import { AuthCard } from "~/components/auth-card"
import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { authClient } from "~/lib/auth-client"
import { authErrorMessage, unwrap } from "~/lib/auth-errors"
import { signUpSchema } from "~/lib/schemas"

export const Route = createFileRoute("/_auth/sign-up")({
  head: () => ({ meta: [{ title: "Create account · Cockpit" }] }),
  component: SignUpPage,
})

function SignUpPage() {
  const signUp = useMutation({
    mutationFn: (values: z.infer<typeof signUpSchema>) =>
      unwrap(
        authClient.signUp.email({
          ...values,
          callbackURL: `${window.location.origin}/`,
        }),
      ),
  })

  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: signUpSchema },
    onSubmit: async ({ value }) => {
      await signUp.mutateAsync(value).catch(() => {})
    },
  })

  if (signUp.isSuccess) {
    return (
      <AuthCard
        title="Check your inbox"
        description={
          <>
            We sent a verification link to{" "}
            <strong className="font-semibold text-ink">{signUp.variables.email}</strong>. Open it to
            finish setting up your cockpit.
          </>
        }
      >
        <Button asChild variant="secondary" className="w-full">
          <Link to="/login">Back to log in</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create your cockpit"
      description="One place for everything you're running."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
            Log in
          </Link>
        </>
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
        {signUp.error ? <FormAlert>{authErrorMessage(signUp.error)}</FormAlert> : null}

        <form.AppField name="name">
          {(field) => <field.TextField label="Name" autoComplete="name" autoFocus />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.PasswordField
              label="Password"
              autoComplete="new-password"
              hint={<span className="text-caption text-mute">12+ characters</span>}
            />
          )}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton pendingLabel="Creating account…" pending={signUp.isPending}>
            Create account
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </AuthCard>
  )
}
