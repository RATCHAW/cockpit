import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cockpit/ui/components/alert-dialog"
import { Button } from "@cockpit/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cockpit/ui/components/dropdown-menu"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { cn } from "@cockpit/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import {
  BanknoteIcon,
  BitcoinIcon,
  CreditCardIcon,
  EllipsisIcon,
  LandmarkIcon,
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { api } from "~/lib/api"
import {
  ACCOUNT_TYPE_LABELS,
  financeKey,
  formatAsset,
  formatMoney,
  type Account,
  type AccountList as AccountListData,
  type AccountType,
} from "~/lib/finance"
import { daysBetween, localToday, relativeDays } from "~/lib/projects"

const ICONS = {
  bank: LandmarkIcon,
  cash: BanknoteIcon,
  wallet: CreditCardIcon,
  crypto: BitcoinIcon,
  savings: PiggyBankIcon,
  investment: TrendingUpIcon,
} satisfies Record<AccountType, LucideIcon>

/** Balances older than this get a nudge to update them. */
const STALE_DAYS = 30

export function AccountList({
  data,
  onAdd,
  onEdit,
  onUpdateBalance,
}: {
  data: AccountListData | undefined
  onAdd: () => void
  onEdit: (account: Account) => void
  onUpdateBalance: (account: Account) => void
}) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null)

  const remove = useMutation({
    mutationFn: (a: Account) =>
      parseResponse(api.finance.accounts[":id"].$delete({ param: { id: a.id } })),
    onSuccess: async () => {
      setConfirmDelete(null)
      await queryClient.invalidateQueries({ queryKey: financeKey })
      toast.success("Account deleted")
    },
    onError: () => toast.error("Couldn't delete the account. Try again."),
  })

  const groups = data
    ? [
        {
          id: "spendable",
          title: "Ready to spend",
          total: data.totals.spendable,
          items: data.items.filter((a) => a.spendable),
        },
        {
          id: "set-aside",
          title: "Set aside",
          total: data.totals.setAside,
          items: data.items.filter((a) => !a.spendable),
        },
      ].filter((g) => g.items.length > 0)
    : []

  return (
    <section
      className="grid content-start gap-5 rounded-xl bg-canvas p-6"
      aria-labelledby="accounts-title"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="accounts-title" className="text-display-xs">
            Accounts
          </h2>
          <p className="text-body-sm text-body">Tap one to update its balance.</p>
        </div>
        <Button variant="secondary" size="icon-sm" onClick={onAdd} aria-label="Add an account">
          <PlusIcon />
        </Button>
      </header>

      {!data ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 bg-canvas-soft" />
          ))}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="grid gap-2">
            <h3
              id={`group-${group.id}`}
              className="flex items-baseline justify-between gap-3 text-body-sm font-semibold text-body"
            >
              {group.title}
              <span className="tabular-nums">{formatMoney(group.total, data.currency)}</span>
            </h3>
            <ul className="-mx-3 grid" aria-labelledby={`group-${group.id}`}>
              {group.items.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  currency={data.currency}
                  onUpdateBalance={() => onUpdateBalance(a)}
                  onEdit={() => onEdit(a)}
                  onDelete={() => setConfirmDelete(a)}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its balance history goes with it, so your net worth over time will change. If you
              closed the account, set its balance to 0 instead to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (confirmDelete) remove.mutate(confirmDelete)
              }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function AccountRow({
  account: a,
  currency,
  onUpdateBalance,
  onEdit,
  onDelete,
}: {
  account: Account
  currency: string
  onUpdateBalance: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const Icon = ICONS[a.type]
  const today = localToday()
  const stale = daysBetween(a.updatedOn, today) > STALE_DAYS

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onUpdateBalance}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 pl-3 text-left transition-colors duration-150 ease-out hover:bg-canvas-soft focus-visible:ring-[3px] focus-visible:ring-ink/20 focus-visible:outline-none"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas-soft">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-body-md font-semibold">{a.name}</span>
          <span
            className={cn(
              "truncate text-body-sm",
              stale ? "font-semibold text-warning-deep" : "text-body",
            )}
          >
            {ACCOUNT_TYPE_LABELS[a.type]}
            {" · "}
            {stale
              ? `Not updated in ${daysBetween(a.updatedOn, today)} days`
              : a.updatedOn === today
                ? "Updated today"
                : `Updated ${relativeDays(a.updatedOn, today)}`}
          </span>
        </span>
        <span className="grid shrink-0 justify-items-end pr-1">
          <span
            className={cn(
              "text-body-md font-semibold tabular-nums",
              a.converted < 0 && "text-negative-deep",
            )}
          >
            {formatMoney(a.converted, currency)}
          </span>
          {a.currency !== currency ? (
            <span className="text-body-sm text-mute tabular-nums">
              {formatAsset(a.balance, a.currency)}
            </span>
          ) : null}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${a.name}`}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-lg">
          <DropdownMenuItem onSelect={onUpdateBalance}>
            <RefreshCwIcon />
            Update balance
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
