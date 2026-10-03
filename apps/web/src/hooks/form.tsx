import { Button } from "@cockpit/ui/components/button"
import { Input } from "@cockpit/ui/components/input"
import { Label } from "@cockpit/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cockpit/ui/components/select"
import { cn } from "@cockpit/ui/lib/utils"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react"
import { useId, useState, type ComponentProps, type ReactNode } from "react"

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts()

type FieldShellProps = {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        {hint}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-negative-darkest">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function useFieldError() {
  const field = useFieldContext<string>()
  const error = field.state.meta.errors[0] as { message?: string } | string | undefined
  return typeof error === "string" ? error : error?.message
}

type TextFieldProps = Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange" | "onBlur"> & {
  label: string
  hint?: ReactNode
}

function TextField({ label, hint, ...props }: TextFieldProps) {
  const id = useId()
  const field = useFieldContext<string>()
  const error = useFieldError()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        name={field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
    </FieldShell>
  )
}

function PasswordField({ label, hint, ...props }: TextFieldProps) {
  const id = useId()
  const field = useFieldContext<string>()
  const error = useFieldError()
  const [visible, setVisible] = useState(false)
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <Input
          id={id}
          name={field.name}
          type={visible ? "text" : "password"}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="pr-12"
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1 right-1"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </div>
    </FieldShell>
  )
}

type SelectFieldProps = {
  label: string
  hint?: ReactNode
  placeholder?: string
  options: ReadonlyArray<{ value: string; label: ReactNode }>
  disabled?: boolean
}

function SelectField({ label, hint, placeholder, options, disabled }: SelectFieldProps) {
  const id = useId()
  const field = useFieldContext<string>()
  const error = useFieldError()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <Select
        name={field.name}
        value={field.state.value}
        onValueChange={(value) => {
          field.handleChange(value)
          field.handleBlur()
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}

function SubmitButton({
  children,
  pendingLabel,
  pending,
  className,
}: {
  children: ReactNode
  pendingLabel: string
  /** Extra pending signal, e.g. a React Query mutation that outlives form submission. */
  pending?: boolean
  className?: string
}) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(s) => s.isSubmitting}>
      {(isSubmitting) => {
        const busy = isSubmitting || pending
        return (
          <Button type="submit" disabled={busy} className={cn("w-full", className)}>
            {busy ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden />
                {pendingLabel}
              </>
            ) : (
              children
            )}
          </Button>
        )
      }}
    </form.Subscribe>
  )
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, PasswordField, SelectField },
  formComponents: { SubmitButton },
})
