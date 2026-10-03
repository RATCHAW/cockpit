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
import { cn } from "@cockpit/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { EllipsisIcon, FlameIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { CheckButton } from "~/components/projects/check-button"
import { useHabitCheckin } from "~/hooks/use-habit-checkin"
import { api } from "~/lib/api"
import { formatDate } from "~/lib/finance"
import {
  addDays,
  describeHabit,
  describeStreak,
  habitProgress,
  HABIT_HISTORY_WEEKS,
  projectsKey,
  weekStart,
  type Habit,
} from "~/lib/projects"

export function HabitList({
  habits,
  today,
  onEdit,
}: {
  habits: Habit[]
  today: string
  onEdit: (habit: Habit) => void
}) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null)

  const remove = useMutation({
    mutationFn: (h: Habit) => parseResponse(api.habits[":id"].$delete({ param: { id: h.id } })),
    onSuccess: async () => {
      setConfirmDelete(null)
      await queryClient.invalidateQueries({ queryKey: projectsKey })
      toast.success("Habit deleted")
    },
    onError: () => toast.error("Couldn't delete the habit. Try again."),
  })

  return (
    <>
      <ul className="grid gap-4 lg:grid-cols-2">
        {habits.map((habit) => (
          <li key={habit.id}>
            <HabitCard
              habit={habit}
              today={today}
              onEdit={() => onEdit(habit)}
              onDelete={() => setConfirmDelete(habit)}
            />
          </li>
        ))}
      </ul>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its check-in history and streak go with it. This can't be undone.
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
              Delete habit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function HabitCard({
  habit,
  today,
  onEdit,
  onDelete,
}: {
  habit: Habit
  today: string
  onEdit: () => void
  onDelete: () => void
}) {
  const checkin = useHabitCheckin()
  const done = new Set(habit.checkins)
  const { thisWeek, met } = habitProgress(habit, today)
  const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  return (
    <article className="grid gap-5 rounded-xl bg-canvas-soft p-5">
      <header className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 className="truncate text-body-lg font-semibold">{habit.name}</h3>
          <p className="text-body-sm text-body">
            {describeHabit(habit)}
            {habit.cadence === "weekly" ? (
              <>
                {" · "}
                <span className={cn("tabular-nums", met && "font-semibold text-positive-deep")}>
                  {thisWeek} of {habit.target} this week
                </span>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full bg-canvas px-3 py-1 text-body-sm font-semibold tabular-nums",
            habit.streak === 0 && "text-mute",
          )}
        >
          <FlameIcon
            className={cn("size-4", habit.streak > 0 ? "text-warning-deep" : "text-mute")}
            aria-hidden
          />
          <span className="sr-only">Streak:</span>
          {describeStreak(habit)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${habit.name}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-lg">
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
      </header>

      {/* The last week is editable, for days you forgot to log. */}
      <ol className="grid grid-cols-7 gap-1" aria-label="Last 7 days">
        {lastWeek.map((day) => {
          const checked = done.has(day)
          const isToday = day === today
          const label = formatDate(day, { weekday: "long", month: "short", day: "numeric" })
          return (
            <li key={day} className="grid justify-items-center gap-1.5">
              <span
                className={cn("text-caption", isToday ? "font-semibold text-ink" : "text-body")}
                aria-hidden
              >
                {isToday ? "Today" : formatDate(day, { weekday: "narrow" })}
              </span>
              <CheckButton
                checked={checked}
                size={isToday ? "md" : "sm"}
                onClick={() => checkin.mutate({ habitId: habit.id, date: day, done: !checked })}
                aria-label={`${label}: ${checked ? "done" : "not done"}`}
              />
            </li>
          )
        })}
      </ol>

      <History done={done} today={today} />
    </article>
  )
}

/** Half a year at a glance: one column per week, Monday at the top. */
function History({ done, today }: { done: ReadonlySet<string>; today: string }) {
  const firstMonday = addDays(weekStart(today), -(HABIT_HISTORY_WEEKS - 1) * 7)
  const days = Array.from({ length: HABIT_HISTORY_WEEKS * 7 }, (_, i) => addDays(firstMonday, i))
  const count = days.filter((d) => done.has(d)).length

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between text-caption text-body">
        <span>Last {HABIT_HISTORY_WEEKS} weeks</span>
        <span className="tabular-nums">
          {count} day{count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex justify-end overflow-hidden">
        <div
          className="grid shrink-0 grid-flow-col grid-rows-7 gap-[3px]"
          role="img"
          aria-label={`Done on ${count} days in the last ${HABIT_HISTORY_WEEKS} weeks`}
        >
          {days.map((day) => (
            <span
              key={day}
              title={formatDate(day, { month: "short", day: "numeric" })}
              className={cn(
                "size-2.5 rounded-[3px]",
                day > today ? "bg-transparent" : done.has(day) ? "bg-ink" : "bg-canvas",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
