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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import {
  categoriesQueryOptions,
  CURRENCIES,
  currencyOptions,
  financeKey,
  formatDate,
  formatMoney,
  isCurrency,
  isoDate,
  parseAmount,
  REPEATS,
  TRANSACTION_KINDS,
  type Account,
  type Currency,
  type Repeat,
  type Schedule,
  type Transaction,
  type TransactionKind,
} from "~/lib/finance"

export type TransactionDialogState =
  | { mode: "create"; repeat?: Repeat }
  | { mode: "edit"; transaction: Transaction }
  | { mode: "schedule"; schedule: Schedule }

const baseSchema = z
  .object({
    kind: z.enum(TRANSACTION_KINDS),
    amount: z
      .string()
      .trim()
      .min(1, "Enter an amount.")
      .refine((v) => parseAmount(v) > 0, "Enter an amount above zero."),
    currency: z.enum(CURRENCIES),
    /** "" when there's no account to pick. */
    accountId: z.string(),
    description: z
      .string()
      .trim()
      .min(1, "What was it for?")
      .max(120, "Keep it under 120 characters."),
    category: z.string().min(1, "Pick a category."),
    date: z.iso.date("Pick a date."),
    repeat: z.enum(Object.keys(REPEATS) as [Repeat, ...Repeat[]]),
    endDate: z.union([z.literal(""), z.iso.date("Pick a valid date.")]),
  })
  .refine((v) => v.repeat === "none" || !v.endDate || v.endDate >= v.date, {
    message: "The end date can't be before the start.",
    path: ["endDate"],
  })

/** Once you have accounts, every transaction says which one it went through. */
const formSchema = (requireAccount: boolean) =>
  baseSchema.refine((v) => !requireAccount || v.accountId !== "", {
    message: "Pick the account it went through.",
    path: ["accountId"],
  })

type FormValues = z.infer<typeof baseSchema>

const repeatOptions = Object.entries(REPEATS).map(([value, { label }]) => ({ value, label }))

const withCurrentCategory = (names: string[], current: string) =>
  current && !names.includes(current) ? [current, ...names] : names

function initialValues(
  state: TransactionDialogState,
  defaultCurrency: Currency,
  defaultAccount: Account | undefined,
): FormValues {
  const blank = { repeat: "none" as Repeat, endDate: "" }
  switch (state.mode) {
    case "create":
      return {
        ...blank,
        repeat: state.repeat ?? "none",
        kind: "expense",
        amount: "",
        currency:
          defaultAccount && isCurrency(defaultAccount.currency)
            ? defaultAccount.currency
            : defaultCurrency,
        accountId: defaultAccount?.id ?? "",
        description: "",
        category: "",
        date: isoDate(new Date()),
      }
    case "edit": {
      const t = state.transaction
      return { ...blank, ...pick(t), date: t.date }
    }
    case "schedule": {
      const s = state.schedule
      const repeat =
        (Object.entries(REPEATS).find(
          ([, r]) => "frequency" in r && r.frequency === s.frequency && r.interval === s.interval,
        )?.[0] as Repeat | undefined) ?? "monthly"
      return { ...pick(s), date: s.startDate, repeat, endDate: s.endDate ?? "" }
    }
  }
}

function pick(t: Transaction | Schedule) {
  return {
    kind: t.kind,
    amount: String(t.amount),
    currency: t.currency,
    accountId: t.accountId ?? "",
    description: t.description,
    category: t.category,
  }
}

const titles = {
  create: {
    title: "Add a transaction",
    description: "Money in or out. Make it repeat for subscriptions, rent or salary.",
  },
  edit: { title: "Edit transaction", description: undefined },
  schedule: {
    title: "Edit schedule",
    description: "Changes apply to upcoming occurrences. Ones already booked stay as they are.",
  },
} satisfies Record<TransactionDialogState["mode"], { title: string; description?: string }>

export function TransactionDialog({
  state,
  onClose,
  defaultCurrency,
  accounts,
  lastAccountId,
}: {
  state: TransactionDialogState | null
  onClose: () => void
  defaultCurrency: Currency
  accounts: Account[]
  /** Preselected for new transactions while it still exists. */
  lastAccountId: string | undefined
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>{titles[state.mode].title}</DialogTitle>
              {titles[state.mode].description ? (
                <DialogDescription>{titles[state.mode].description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <TransactionForm
              state={state}
              onDone={onClose}
              defaultCurrency={defaultCurrency}
              accounts={accounts}
              lastAccountId={lastAccountId}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TransactionForm({
  state,
  onDone,
  defaultCurrency,
  accounts,
  lastAccountId,
}: {
  state: TransactionDialogState
  onDone: () => void
  defaultCurrency: Currency
  accounts: Account[]
  lastAccountId: string | undefined
}) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKey })
  const categories = useQuery(categoriesQueryOptions)
  const categoryNames = (kind: TransactionKind) =>
    categories.data?.items.filter((c) => c.kind === kind).map((c) => c.name) ?? []

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const fields = {
        kind: values.kind,
        amount: parseAmount(values.amount),
        currency: values.currency,
        description: values.description.trim(),
        category: values.category,
        accountId: values.accountId || null,
      }
      const endDate = values.endDate || null
      if (state.mode === "edit") {
        const id = state.transaction.id
        await parseResponse(
          api.finance.transactions[":id"].$patch({
            param: { id },
            json: { ...fields, date: values.date },
          }),
        )
        return "Transaction updated"
      }
      if (state.mode === "schedule") {
        const id = state.schedule.id
        await parseResponse(
          api.finance.recurring[":id"].$patch({ param: { id }, json: { ...fields, endDate } }),
        )
        return "Schedule updated"
      }
      const repeat = REPEATS[values.repeat]
      if (!("frequency" in repeat)) {
        await parseResponse(
          api.finance.transactions.$post({ json: { ...fields, date: values.date } }),
        )
        return `${fields.kind === "income" ? "Income" : "Expense"} added`
      }
      await parseResponse(
        api.finance.recurring.$post({
          json: {
            ...fields,
            frequency: repeat.frequency,
            interval: repeat.interval,
            startDate: values.date,
            endDate,
          },
        }),
      )
      return `Scheduled ${repeat.label.toLowerCase()}`
    },
    onSuccess: async (message) => {
      await refresh()
      toast.success(message)
      onDone()
    },
  })

  const remove = useMutation({
    mutationFn: async (t: Transaction) => {
      await parseResponse(api.finance.transactions[":id"].$delete({ param: { id: t.id } }))
      return t
    },
    onSuccess: async (t) => {
      onDone()
      await refresh()
      toast("Transaction deleted", {
        description: `${t.description} · ${formatMoney(t.amount, t.currency)}`,
        action: {
          label: "Undo",
          onClick: async () => {
            const { kind, amount, currency, description, category, date, accountId } = t
            await parseResponse(
              api.finance.transactions.$post({
                json: { kind, amount, currency, description, category, date, accountId },
              }),
            ).catch(() => toast.error("Couldn't restore it. Add it again manually."))
            await refresh()
          },
        },
      })
    },
    onError: () => toast.error("Couldn't delete it. Try again."),
  })

  const defaultAccount =
    accounts.find((a) => a.id === lastAccountId) ?? accounts.find((a) => a.spendable) ?? accounts[0]
  // Day-to-day accounts first; savings rarely pay for things.
  const accountOptions = accounts
    .toSorted((a, b) => Number(b.spendable) - Number(a.spendable))
    .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))
  const form = useAppForm({
    defaultValues: initialValues(state, defaultCurrency, defaultAccount),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema(accounts.length > 0) },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => {})
    },
  })

  const isSchedule = state.mode === "schedule"

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

      <form.Field
        name="kind"
        listeners={{
          onChange: ({ value }) => {
            const category = form.getFieldValue("category")
            if (category && !categoryNames(value).includes(category)) {
              form.setFieldValue("category", "")
            }
          },
        }}
      >
        {(field) => (
          <Tabs
            value={field.state.value}
            onValueChange={(v) => field.handleChange(v as TransactionKind)}
          >
            <TabsList className="w-full" aria-label="Type">
              <TabsTrigger value="expense">Expense</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </form.Field>

      <div className="grid grid-cols-[1fr_9.5rem] gap-3">
        <form.AppField name="amount">
          {(field) => (
            <field.TextField
              label="Amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="tabular-nums"
              autoFocus={state.mode === "create"}
            />
          )}
        </form.AppField>
        <form.AppField name="currency">
          {(field) => (
            <field.SelectField
              label="Currency"
              options={currencyOptions.map((o) => ({ value: o.value, label: o.value }))}
            />
          )}
        </form.AppField>
      </div>

      {accounts.length > 0 ? (
        <form.Subscribe selector={(s) => s.values.kind}>
          {(kind) => (
            <form.AppField
              name="accountId"
              listeners={{
                onChange: ({ value }) => {
                  const currency = accounts.find((a) => a.id === value)?.currency
                  if (currency && isCurrency(currency)) form.setFieldValue("currency", currency)
                },
              }}
            >
              {(field) => (
                <field.SelectField
                  label={kind === "income" ? "Paid into" : "Paid from"}
                  placeholder="Pick an account"
                  options={accountOptions}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
      ) : null}

      <form.AppField name="description">
        {(field) => (
          <field.TextField
            label="Description"
            autoComplete="off"
            placeholder="e.g. Netflix, groceries, salary"
          />
        )}
      </form.AppField>

      <form.Subscribe selector={(s) => [s.values.kind, s.values.category] as const}>
        {([kind, category]) => (
          <form.AppField name="category">
            {(field) => (
              <field.SelectField
                label="Category"
                placeholder="Pick a category"
                options={withCurrentCategory(categoryNames(kind), category).map((name) => ({
                  value: name,
                  label: name,
                }))}
              />
            )}
          </form.AppField>
        )}
      </form.Subscribe>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <form.AppField name="date">
          {(field) => (
            <field.TextField
              label={isSchedule ? "Started" : "Date"}
              type="date"
              disabled={isSchedule}
            />
          )}
        </form.AppField>
        {state.mode !== "edit" ? (
          <form.AppField name="repeat">
            {(field) => (
              <field.SelectField label="Repeat" options={repeatOptions} disabled={isSchedule} />
            )}
          </form.AppField>
        ) : null}
      </div>

      <form.Subscribe
        selector={(s) => [s.values.accountId, s.values.date, s.values.repeat] as const}
      >
        {([accountId, date, repeat]) => {
          const account = accounts.find((a) => a.id === accountId)
          return account && repeat === "none" && date && date < account.updatedOn ? (
            <p className="text-body-sm text-mute">
              The {account.name} balance you recorded on{" "}
              {formatDate(account.updatedOn, { month: "short", day: "numeric" })} already includes
              this, so it won't change.
            </p>
          ) : null
        }}
      </form.Subscribe>

      <form.Subscribe selector={(s) => s.values.repeat}>
        {(repeat) =>
          repeat !== "none" ? (
            <form.AppField name="endDate">
              {(field) => (
                <field.TextField
                  label="Ends"
                  type="date"
                  hint={<span className="text-body-sm text-mute">Optional</span>}
                />
              )}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>

      <DialogFooter className="gap-3 pt-1 sm:items-center sm:justify-between">
        {state.mode === "edit" ? (
          <Button
            type="button"
            variant="ghost"
            className="text-negative-darkest"
            disabled={remove.isPending}
            onClick={() => remove.mutate(state.transaction)}
          >
            <Trash2Icon />
            Delete
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <form.AppForm>
          <form.SubmitButton pendingLabel="Saving…" pending={save.isPending} className="sm:w-auto">
            {state.mode === "create" ? "Add" : "Save changes"}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
