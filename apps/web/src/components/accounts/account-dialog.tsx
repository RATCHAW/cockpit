import { Button } from "@cockpit/ui/components/button"
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
import { ArrowLeftRightIcon, ArrowUpDownIcon } from "lucide-react"
import { useState } from "react"
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

const moveAmountField = z
  .string()
  .trim()
  .refine((v) => v === "" || parseAmount(v) > 0, "Enter an amount above 0, e.g. 500.")

const moveSchema = z
  .object({
    fromAccountId: z.string(),
    toAccountId: z.string(),
    amount: moveAmountField.refine((v) => v !== "", "Enter the amount."),
    /** Only asked for across currencies; "" uses the exchange rate. */
    received: moveAmountField,
    date: z.iso
      .date("Pick a date.")
      .refine((d) => d <= isoDate(new Date()), "Transfers can't be in the future."),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Pick a different account.",
    path: ["toAccountId"],
  })

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
  accounts,
}: {
  state: AccountDialogState | null
  onClose: () => void
  defaultCurrency: Asset
  /** Where money can be moved to or from. */
  accounts: Account[]
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
                  Now {formatAsset(state.account.balance, state.account.currency)}. Last checked{" "}
                  {formatDate(state.account.updatedOn, { month: "short", day: "numeric" })}.
                </DialogDescription>
              ) : titles[state.mode].description ? (
                <DialogDescription>{titles[state.mode].description}</DialogDescription>
              ) : null}
            </DialogHeader>
            {state.mode === "balance" ? (
              <BalancePanel account={state.account} accounts={accounts} onDone={onClose} />
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

/** Either the balance was checked, or money went to or came from another account. */
function BalancePanel({
  account,
  accounts,
  onDone,
}: {
  account: Account
  accounts: Account[]
  onDone: () => void
}) {
  const [tab, setTab] = useState<"set" | "move">("set")
  if (!accounts.some((a) => a.id !== account.id)) {
    return <BalanceForm account={account} onDone={onDone} />
  }
  return (
    <div className="grid gap-5">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full" aria-label="What changed">
          <TabsTrigger value="set">Set balance</TabsTrigger>
          <TabsTrigger value="move">Move money</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "set" ? (
        <BalanceForm account={account} onDone={onDone} />
      ) : (
        <MoveForm account={account} accounts={accounts} onDone={onDone} />
      )}
    </div>
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
            ? "No change."
            : `${formatAsset(change, account.currency, { sign: true })} from before.`,
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

function MoveForm({
  account,
  accounts,
  onDone,
}: {
  account: Account
  accounts: Account[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKey })
  const byId = (id: string) => accounts.find((a) => a.id === id)
  // Day-to-day accounts first: money mostly moves between the bank, cash and wallets.
  const options = accounts
    .toSorted((a, b) => Number(b.spendable) - Number(a.spendable))
    .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof moveSchema>) => {
      const from = byId(values.fromAccountId)!
      const to = byId(values.toAccountId)!
      const transfer = await parseResponse(
        api.finance.transfers.$post({
          json: {
            fromAccountId: from.id,
            toAccountId: to.id,
            amount: parseAmount(values.amount),
            received: values.received ? parseAmount(values.received) : undefined,
            date: values.date,
          },
        }),
      )
      return { transfer, from, to }
    },
    onSuccess: async ({ transfer, from, to }) => {
      await refresh()
      toast.success(`Moved ${formatAsset(transfer.amount, from.currency)} to ${to.name}`, {
        description:
          from.currency === to.currency
            ? `From ${from.name}.`
            : `From ${from.name}. ${to.name} got ${formatAsset(transfer.received, to.currency)}.`,
        action: {
          label: "Undo",
          onClick: async () => {
            await parseResponse(
              api.finance.transfers[":id"].$delete({ param: { id: transfer.id } }),
            ).catch(() => toast.error("Couldn't undo it. Update both balances instead."))
            await refresh()
          },
        },
      })
      onDone()
    },
  })

  // Same currency first (nothing to convert), then day-to-day money.
  const likeliness = (a: Account) =>
    2 * Number(a.currency === account.currency) + Number(a.spendable)
  const counterpart = accounts
    .filter((a) => a.id !== account.id)
    .toSorted((a, b) => likeliness(b) - likeliness(a))[0]!

  const form = useAppForm({
    defaultValues: {
      fromAccountId: account.id,
      toAccountId: counterpart.id,
      amount: "",
      received: "",
      date: isoDate(new Date()),
    } as z.infer<typeof moveSchema>,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: moveSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => {})
    },
  })

  // A received amount only means something for the pair of accounts it was typed for.
  const clearReceived = { onChange: () => form.setFieldValue("received", "") }

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
        <FormAlert>Couldn't move that. Check your connection and try again.</FormAlert>
      ) : null}

      {/* Two selects side by side don't fit a phone, so they stack there with the swap beside both. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
        <div className="col-start-1 row-start-1">
          <form.AppField name="fromAccountId" listeners={clearReceived}>
            {(field) => <field.SelectField label="From" options={options} />}
          </form.AppField>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="col-start-2 row-span-2 row-start-1 sm:row-span-1 sm:mt-5.5"
          aria-label="Swap accounts"
          onClick={() => {
            const { fromAccountId, toAccountId } = form.state.values
            form.setFieldValue("fromAccountId", toAccountId)
            form.setFieldValue("toAccountId", fromAccountId)
            form.setFieldValue("received", "")
          }}
        >
          <ArrowUpDownIcon className="sm:hidden" />
          <ArrowLeftRightIcon className="hidden sm:block" />
        </Button>
        <div className="col-start-1 row-start-2 sm:col-start-3 sm:row-start-1">
          <form.AppField name="toAccountId" listeners={clearReceived}>
            {(field) => <field.SelectField label="To" options={options} />}
          </form.AppField>
        </div>
      </div>

      <form.Subscribe
        selector={(s) => [byId(s.values.fromAccountId), byId(s.values.toAccountId)] as const}
      >
        {([from, to]) => (
          <>
            <div className="grid gap-5 sm:grid-cols-[1fr_11rem] sm:gap-3">
              <form.AppField name="amount">
                {(field) => (
                  <field.TextField
                    label={from ? `Amount in ${from.currency}` : "Amount"}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="tabular-nums"
                    autoFocus
                  />
                )}
              </form.AppField>
              <form.AppField name="date">
                {(field) => <field.TextField label="On" type="date" max={isoDate(new Date())} />}
              </form.AppField>
            </div>
            {from && to && from.currency !== to.currency ? (
              <form.AppField name="received">
                {(field) => (
                  <field.TextField
                    label={`${to.name} got, in ${to.currency}`}
                    hint={<span className="text-body-sm text-mute">Optional</span>}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="At the exchange rate"
                    className="tabular-nums"
                  />
                )}
              </form.AppField>
            ) : null}
          </>
        )}
      </form.Subscribe>

      <form.Subscribe
        selector={(s) =>
          [byId(s.values.fromAccountId), byId(s.values.toAccountId), s.values.date] as const
        }
      >
        {([from, to, date]) => {
          const counted = [from, to].filter(
            (a): a is Account => !!a && !!date && date < a.updatedOn,
          )
          if (counted.length === 0) return null
          const first = counted[0]!
          return (
            <p className="text-body-sm text-mute">
              {counted.length === 2 ? (
                <>
                  The balances you recorded for both accounts since then already include this, so
                  they won't change.
                </>
              ) : (
                <>
                  The {first.name} balance you recorded on{" "}
                  {formatDate(first.updatedOn, { month: "short", day: "numeric" })} already includes
                  this, so it won't change.
                </>
              )}
            </p>
          )
        }}
      </form.Subscribe>

      <DialogFooter className="pt-1">
        <Button type="button" variant="ghost" onClick={onDone} className="hidden sm:inline-flex">
          Cancel
        </Button>
        <form.AppForm>
          <form.SubmitButton pendingLabel="Moving…" pending={save.isPending} className="sm:w-auto">
            Move money
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
