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
import { Badge } from "@cockpit/ui/components/badge"
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
import { EllipsisIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { api } from "~/lib/api"
import { describeSchedule, financeKey, formatDate, formatMoney, type Schedule } from "~/lib/finance"

type RecurringList = {
  currency: string
  items: Schedule[]
  monthly: { income: number; expense: number }
}

export function ScheduleList({
  data,
  onEdit,
  onAdd,
}: {
  data: RecurringList | undefined
  onEdit: (schedule: Schedule) => void
  onAdd: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<Schedule | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKey })

  const toggle = useMutation({
    mutationFn: (s: Schedule) =>
      parseResponse(
        api.finance.recurring[":id"].$patch({ param: { id: s.id }, json: { active: !s.active } }),
      ),
    onSuccess: async (s) => {
      await refresh()
      toast.success(s.active ? `${s.description} resumed` : `${s.description} paused`)
    },
    onError: () => toast.error("Couldn't update the schedule. Try again."),
  })

  const remove = useMutation({
    mutationFn: (s: Schedule) =>
      parseResponse(api.finance.recurring[":id"].$delete({ param: { id: s.id } })),
    onSuccess: async () => {
      setConfirmDelete(null)
      await refresh()
      toast.success("Schedule deleted")
    },
    onError: () => toast.error("Couldn't delete the schedule. Try again."),
  })

  return (
    <section
      className="grid content-start gap-5 rounded-xl bg-canvas p-6"
      aria-labelledby="scheduled-title"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="scheduled-title" className="text-display-xs">
            Scheduled
          </h2>
          {data && data.items.length > 0 ? (
            <p className="text-body-sm text-body">
              About{" "}
              <span className="font-semibold text-ink tabular-nums">
                {formatMoney(data.monthly.expense, data.currency)}
              </span>{" "}
              a month in bills and subscriptions.
            </p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={onAdd}
          aria-label="Schedule a transaction"
        >
          <PlusIcon />
        </Button>
      </header>

      {!data ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 bg-canvas-soft" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <p className="rounded-lg bg-canvas-soft p-4 text-body-sm text-body">
          Add subscriptions, rent or your salary once and they'll book themselves.
        </p>
      ) : (
        <ul className="-mx-3 grid">
          {data.items.map((s) => {
            const ended = s.nextDate === null
            const income = s.kind === "income"
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-md py-2 pr-1 pl-3",
                  (!s.active || ended) && "opacity-60",
                )}
              >
                <div className="grid min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body-md font-semibold">{s.description}</span>
                    {!s.active ? <Badge>Paused</Badge> : ended ? <Badge>Ended</Badge> : null}
                  </span>
                  <span className="truncate text-body-sm text-body">
                    {describeSchedule(s)}
                    {s.active && s.nextDate
                      ? ` · ${formatDate(s.nextDate, { month: "short", day: "numeric" })}`
                      : null}
                  </span>
                </div>
                <div className="grid shrink-0 justify-items-end">
                  <span
                    className={cn(
                      "text-body-md font-semibold tabular-nums",
                      income && "text-positive-deep",
                    )}
                  >
                    {formatMoney(income ? s.converted : -s.converted, data.currency, {
                      sign: true,
                    })}
                  </span>
                  {s.currency !== data.currency ? (
                    <span className="text-body-sm text-mute tabular-nums">
                      {formatMoney(s.amount, s.currency)}
                    </span>
                  ) : null}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions for ${s.description}`}
                    >
                      <EllipsisIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-lg">
                    <DropdownMenuItem onSelect={() => onEdit(s)}>
                      <PencilIcon />
                      Edit
                    </DropdownMenuItem>
                    {!ended ? (
                      <DropdownMenuItem
                        disabled={toggle.isPending}
                        onSelect={() => toggle.mutate(s)}
                      >
                        {s.active ? <PauseIcon /> : <PlayIcon />}
                        {s.active ? "Pause" : "Resume"}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(s)}>
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.description}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It won't book any more transactions. The ones it already booked stay in your history.
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
              Delete schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
