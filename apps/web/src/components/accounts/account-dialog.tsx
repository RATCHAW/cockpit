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
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  ASSETS,
  assetOptions,
  financeKey,
  formatAsset,
  formatDate,
  isoDate,
  parseAmount,
  spendableByDefault,
  type Account,
  type AccountType,
  type Asset,
} from "~/lib/finance"

export type AccountDialogState =
  { mode: "create" } | { mode: "edit"; account: Account } | { mode: "balance"; account: Account }

const typeOptions = ACCOUNT_TYPES.map((type) => ({ value: type, label: ACCOUNT_TYPE_LABELS[type] }))

const useOptions = [
  { value: "spendable", label: "Ready to spend" },
  { value: "set-aside", label: "Set aside (savings, investments)" },
]

const amountField = z
  .string()
  .trim()
  .min(1, "Enter the balance.")
  .refine((v) => Number.isFinite(parseAmount(v)), "Enter a number, e.g. 1250.50.")

const dateField = z.iso
  .date("Pick a date.")
  .refine((d) => d <= isoDate(new Date()), "Balances can't be from the future.")

const accountSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(60, "Keep it under 60 characters."),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(ASSETS),
  use: z.enum(["spendable", "set-aside"]),
  balance: amountField,
})

const balanceSchema = z.object({ amount: amountField, date: dateField })

const titles = {
  create: {
    title: "Add an account",
    description: "Anywhere you keep money: a bank, cash, RemotePass, Binance.",
  },
  edit: { title: "Edit account", description: undefined },
  balance: { title: "Update balance", description: undefined },
} satisfies Record<AccountDialogState["mode"], { title: string; description?: string }>

export function AccountDialog({
  state,
  onClose,
  defaultCurrency,
}: {
  state: AccountDialogState | null
  onClose: () => void
  defaultCurrency: Asset
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {state.mode === "balance" ? state.account.name : titles[state.mode].title}
              </DialogTitle>
              {state.mode === "balance" ? (
                <DialogDescription>
                  Was {formatAsset(state.account.balance, state.account.currency)} on{" "}
                  {formatDate(state.account.updatedOn, { month: "short", day: "numeric" })}.
                </DialogDescription>
              ) : titles[state.mode].description ? (
                <DialogDescription>{titles[state.mode].description}</DialogDescription>
              ) : null}
            </DialogHeader>
            {state.mode === "balance" ? (
              <BalanceForm account={state.account} onDone={onClose} />
            ) : (
              <AccountForm state={state} onDone={onClose} defaultCurrency={defaultCurrency} />
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AccountForm({
  state,
  onDone,
  defaultCurrency,
}: {
  state: Exclude<AccountDialogState, { mode: "balance" }>
  onDone: () => void
  defaultCurrency: Asset
}) {
  const queryClient = useQueryClient()
  const editing = state.mode === "edit" ? state.account : null

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof accountSchema>) => {
      const fields = {
        name: values.name.trim(),
        type: values.type,
        spendable: values.use === "spendable",
      }
      if (editing) {
        await parseResponse(
          api.finance.accounts[":id"].$patch({ param: { id: editing.id }, json: fields }),
        )
        return `${fields.name} updated`
      }
      await parseResponse(
        api.finance.accounts.$post({
          json: {
            ...fields,
            currency: values.currency,
            balance: parseAmount(values.balance),
            date: isoDate(new Date()),
          },
        }),
      )
      return `${fields.name} added`
    },
    onSuccess: async (message) => {
      await queryClient.invalidateQueries({ queryKey: financeKey })
      toast.success(message)
      onDone()
    },
  })

  const form = useAppForm({
    defaultValues: {
      name: editing?.name ?? "",
      type: editing?.type ?? ("bank" as AccountType),
      currency: editing?.currency ?? defaultCurrency,
      use: (editing?.spendable ?? true) ? "spendable" : "set-aside",
      balance: editing ? String(editing.balance) : "",
    } as z.infer<typeof accountSchema>,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: accountSchema },
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
            label="Name"
            autoComplete="off"
            placeholder="e.g. CIH Bank, Binance, Cash"
            autoFocus={!editing}
          />
        )}
      </form.AppField>

      <form.AppField
        name="type"
        listeners={{
          // Follow the type until the person picks a use themselves.
          onChange: ({ value, fieldApi }) => {
            if (!editing && !fieldApi.form.getFieldMeta("use")?.isDirty) {
              fieldApi.form.setFieldValue(
                "use",
                spendableByDefault(value) ? "spendable" : "set-aside",
                { dontUpdateMeta: true },
              )
            }
          },
        }}
      >
        {(field) => <field.SelectField label="Type" options={typeOptions} />}
      </form.AppField>

      {editing ? null : (
        <div className="grid grid-cols-[1fr_9.5rem] gap-3">
          <form.AppField name="balance">
            {(field) => (
              <field.TextField
                label="Balance today"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className="tabular-nums"
              />
            )}
          </form.AppField>
          <form.AppField name="currency">
            {(field) => (
              <field.SelectField
                label="Currency"
                options={assetOptions.map((o) => ({ value: o.value, label: o.value }))}
              />
            )}
          </form.AppField>
        </div>
      )}

      <form.AppField name="use">
        {(field) => (
          <field.SelectField
            label="Use"
            options={useOptions}
            hint={<span className="text-body-sm text-mute">Shapes what's free to spend</span>}
          />
        )}
      </form.AppField>

      {editing ? (
        <p className="text-body-sm text-mute">
          Held in {editing.currency}. To change the currency, add a new account.
        </p>
      ) : null}

      <DialogFooter className="pt-1">
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            {editing ? "Save changes" : "Add account"}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}

function BalanceForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (values: z.infer<typeof balanceSchema>) =>
      parseResponse(
        api.finance.accounts[":id"].balance.$put({
          param: { id: account.id },
          json: { amount: parseAmount(values.amount), date: values.date },
        }),
      ),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: financeKey })
      const change = updated.balance - account.balance
      toast.success(`${account.name} updated`, {
        description:
          change === 0
            ? "No change since last time."
            : `${formatAsset(change, account.currency, { sign: true })} since last time.`,
      })
      onDone()
    },
  })

  const form = useAppForm({
    defaultValues: { amount: "", date: isoDate(new Date()) },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: balanceSchema },
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

      <div className="grid gap-5 sm:grid-cols-[1fr_11rem] sm:gap-3">
        <form.AppField name="amount">
          {(field) => (
            <field.TextField
              label={`Balance in ${account.currency}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={String(account.balance)}
              className="tabular-nums"
              autoFocus
            />
          )}
        </form.AppField>
        <form.AppField name="date">
          {(field) => <field.TextField label="As of" type="date" max={isoDate(new Date())} />}
        </form.AppField>
      </div>

      <p className="text-body-sm text-mute">
        Use a minus sign for money you owe. Earlier balances are kept for your history.
      </p>

      <DialogFooter className="pt-1">
        <Button type="button" variant="ghost" onClick={onDone} className="hidden sm:inline-flex">
          Cancel
        </Button>
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            Save balance
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
