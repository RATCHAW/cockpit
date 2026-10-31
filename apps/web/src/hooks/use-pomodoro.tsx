import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { api } from "~/lib/api"
import {
  analyticsKey,
  clockLabel,
  pomodoroKey,
  POMODORO_LABELS,
  remainingSeconds,
  timerQueryOptions,
  type TimerAction,
} from "~/lib/pomodoro"

function useTimer() {
  const queryClient = useQueryClient()
  const query = useQuery(timerQueryOptions)
  const [now, setNow] = useState(() => Date.now())
  const audio = useRef<AudioContext | null>(null)
  const observed = useRef<string | null>(null)
  const checked = useRef<string | null>(null)
  const current = query.data?.current
  const remaining = current ? remainingSeconds(current, now + (query.data?.clockOffset ?? 0)) : 0

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(Date.now()),
      current?.status === "running" ? 250 : 1000,
    )
    return () => window.clearInterval(interval)
  }, [current?.status])

  useEffect(() => {
    if (current?.status === "running" && remaining === 0 && checked.current !== current.id) {
      checked.current = current.id
      void queryClient.invalidateQueries({ queryKey: pomodoroKey })
    }
  }, [current, remaining, queryClient])

  useEffect(() => {
    if (current) {
      observed.current = current.id
      return
    }
    const last = query.data?.lastSession
    if (!last || observed.current !== last.id) return
    observed.current = null
    checked.current = null
    void queryClient.invalidateQueries({ queryKey: analyticsKey })
    if (last.status !== "completed") return
    toast.success(
      last.kind === "focus"
        ? "Focus session complete. Time for a break."
        : "Break complete. Ready when you are.",
    )
    const context = audio.current
    if (query.data?.settings.soundEnabled && context?.state === "running") {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.frequency.value = 660
      gain.gain.setValueAtTime(0.15, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.8)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.8)
    }
  }, [current, query.data?.lastSession, query.data?.settings.soundEnabled, queryClient])

  const title = current
    ? `${clockLabel(remaining)} · ${POMODORO_LABELS[current.kind]} · Cockpit`
    : null
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])

  useEffect(
    () => () => {
      void audio.current?.close()
    },
    [],
  )

  const mutation = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: pomodoroKey }),
    mutationFn: (input: TimerAction) => parseResponse(api.pomodoro.$post({ json: input })),
    onSuccess: (state) => {
      queryClient.setQueryData(pomodoroKey, {
        ...state,
        clockOffset: Date.parse(state.serverNow) - Date.now(),
      })
      void queryClient.invalidateQueries({ queryKey: analyticsKey })
    },
    onError: (error) => {
      toast.error(error.message || "Couldn't change the timer. Try again.")
      void queryClient.invalidateQueries({ queryKey: pomodoroKey })
    },
  })

  const act = (input: TimerAction) => {
    if (query.data?.settings.soundEnabled) {
      try {
        audio.current ??= new AudioContext()
        void audio.current.resume().catch(() => {})
      } catch {
        /* The timer also works in browsers without audio support. */
      }
    }
    mutation.mutate(input)
  }

  return { query, current, remaining, act, pending: mutation.isPending, now }
}

const TimerContext = createContext<ReturnType<typeof useTimer> | null>(null)

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const timer = useTimer()
  return <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>
}

export function usePomodoro() {
  const value = useContext(TimerContext)
  if (!value) throw new Error("PomodoroProvider is required")
  return value
}
