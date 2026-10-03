import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { toast } from "sonner"

import { api } from "~/lib/api"
import { refreshProjectsAndTasks, tasksKey, type Task, type TaskStatus } from "~/lib/projects"

type TaskList = { items: Task[] }

/**
 * Moves a task to a column and position. The cache updates before the request goes out, so a
 * drop or a tick doesn't flicker.
 */
export function useMoveTask() {
  const queryClient = useQueryClient()

  const move = useMutation({
    mutationFn: (vars: { id: string; status: TaskStatus; position?: number }) =>
      parseResponse(
        api.tasks[":id"].$patch({
          param: { id: vars.id },
          json: { status: vars.status, position: vars.position },
        }),
      ),
    onError: () => {
      toast.error("Couldn't move that task. Try again.")
    },
    onSettled: () => refreshProjectsAndTasks(queryClient),
  })

  return (id: string, status: TaskStatus, position: number) => {
    void queryClient.cancelQueries({ queryKey: tasksKey })
    queryClient.setQueryData<TaskList>(tasksKey, (data) =>
      data
        ? {
            items: data.items.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    position,
                    completedAt:
                      status === "done" ? (t.completedAt ?? new Date().toISOString()) : null,
                  }
                : t,
            ),
          }
        : data,
    )
    move.mutate({ id, status, position })
  }
}

/** A position above every task in `status`, so a moved task lands at the top of that column. */
export function topOf(tasks: Task[], status: TaskStatus) {
  const positions = tasks.filter((t) => t.status === status).map((t) => t.position)
  return positions.length > 0 ? Math.min(...positions) - 1 : 0
}
