'use client'

// Client-side state for step four.
//
// The onboarding answers live in localStorage and the plan is derived from them
// on the fly. That is deliberate scaffolding: it lets the screens be built and
// reviewed against the real engine before auth and persistence exist. Step five
// replaces the storage layer with Supabase; nothing in the screens should need
// to change, because they only ever see PlanInput and PlanResult.
//
// localStorage and the clock are external stores, so they are read through
// useSyncExternalStore rather than an effect. That is what keeps server markup
// and first client render in agreement without a cascading re-render.

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { generatePlan } from '@/lib/engine'
import type { PlanInput, PlanItemStatus, PlanResult } from '@/lib/domain/types'

export type Answers = Omit<PlanInput, 'today' | 'personalRules'>

const STORAGE_KEY = 'plis.answers.v1'
const STATUS_KEY = 'plis.statuses.v1'

/** A localStorage key exposed as an external store of raw JSON strings. */
function createStore(key: string) {
  const listeners = new Set<() => void>()
  let snapshot: string | null = null
  let loaded = false

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot(): string | null {
      if (!loaded) {
        snapshot = window.localStorage.getItem(key)
        loaded = true
      }
      return snapshot
    },
    getServerSnapshot(): string | null {
      return null
    },
    write(value: string | null) {
      if (value === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, value)
      snapshot = value
      loaded = true
      for (const listener of listeners) listener()
    },
  }
}

const answersStore = createStore(STORAGE_KEY)
const statusStore = createStore(STATUS_KEY)

// Strings compare by value, so returning a fresh one each call is stable enough
// for useSyncExternalStore. Null on the server marks "clock not known yet".
const clockStore = {
  subscribe() {
    return () => {}
  },
  getSnapshot(): string | null {
    return new Date().toISOString().slice(0, 10)
  },
  getServerSnapshot(): string | null {
    return null
  },
}

function parse<T>(raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

type PlanContextValue = {
  ready: boolean
  answers: Answers | null
  saveAnswers: (answers: Answers) => void
  reset: () => void
  plan: PlanResult | null
  planError: string | null
  today: string
  statuses: Record<string, PlanItemStatus>
  setStatus: (itemKey: string, status: PlanItemStatus) => void
}

const PlanContext = createContext<PlanContextValue | null>(null)

export function PlanProvider({ children }: { children: ReactNode }) {
  const rawAnswers = useSyncExternalStore(
    answersStore.subscribe,
    answersStore.getSnapshot,
    answersStore.getServerSnapshot,
  )
  const rawStatuses = useSyncExternalStore(
    statusStore.subscribe,
    statusStore.getSnapshot,
    statusStore.getServerSnapshot,
  )
  const clock = useSyncExternalStore(
    clockStore.subscribe,
    clockStore.getSnapshot,
    clockStore.getServerSnapshot,
  )

  const answers = useMemo(() => parse<Answers>(rawAnswers), [rawAnswers])
  const statuses = useMemo(
    () => parse<Record<string, PlanItemStatus>>(rawStatuses) ?? {},
    [rawStatuses],
  )

  const saveAnswers = useCallback((next: Answers) => {
    answersStore.write(JSON.stringify(next))
  }, [])

  const reset = useCallback(() => {
    answersStore.write(null)
    statusStore.write(null)
  }, [])

  const setStatus = useCallback(
    (key: string, status: PlanItemStatus) => {
      statusStore.write(JSON.stringify({ ...statuses, [key]: status }))
    },
    [statuses],
  )

  const { plan, planError } = useMemo(() => {
    if (!answers || clock === null) return { plan: null, planError: null }
    try {
      return {
        plan: generatePlan({ ...answers, today: clock, personalRules: [] }),
        planError: null,
      }
    } catch (error) {
      // A safety invariant refused the plan. Surfacing the reason beats showing
      // a broken screen, and it must never be swallowed.
      return {
        plan: null,
        planError: error instanceof Error ? error.message : 'Unbekannter Fehler',
      }
    }
  }, [answers, clock])

  const value: PlanContextValue = {
    ready: clock !== null,
    answers,
    saveAnswers,
    reset,
    plan,
    planError,
    today: clock ?? '1970-01-01',
    statuses,
    setStatus,
  }

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider')
  return ctx
}

/** Stable key for an item, since items are derived rather than stored. */
export function itemKey(scheduledOn: string, title: string): string {
  return `${scheduledOn}|${title}`
}
