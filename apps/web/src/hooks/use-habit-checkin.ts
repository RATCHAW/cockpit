import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { toast } from "sonner"

import { api } from "~/lib/api"
import { projectsKey, toggleCheckin, type ProjectList } from "~/lib/projects"

type Vars = { habitId: string; date: string; done: boolean }

/**
 * Marks a habit done (or not) for a day. Updates the UI immediately — it's the most frequent
 * action in the section — then refetches so streaks catch up.
 */
export function useHabitCheckin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, date, done }: Vars) => {
      const req = { param: { id: habitId, date } }
      return parseResponse(
        done
          ? api.habits[":id"].checkins[":date"].$put(req)
          : api.habits[":id"].checkins[":date"].$delete(req),
      )
    },
    onMutate: async ({ habitId, date, done }) => {
      await queryClient.cancelQueries({ queryKey: projectsKey })
      const previous = queryClient.getQueriesData<ProjectList>({ queryKey: projectsKey })
      queryClient.setQueriesData<ProjectList>({ queryKey: projectsKey }, (data) =>
        data ? toggleCheckin(data, habitId, date, done) : data,
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data)
      toast.error("Couldn't save that check-in. Try again.")
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  })
}
