'use client'

// Client-side plan state.
//
// The answers now arrive from the database, loaded by the server component that
// renders this provider. The promise the scaffolding version made is kept: the
// screens see PlanInput and PlanResult and nothing else, so none of them
// changed when the storage moved.
//
// The plan itself is still derived here rather than stored. `generatePlan` is
// pure, so recomputing cannot disagree with what a row says — and there is no
// second copy to keep in step.
//
// The clock stays on the client. The server runs in UTC, and someone opening
// the app at half past midnight in Berlin would otherwise be shown yesterday.
// It is read through useSyncExternalStore rather than an effect, which is what
// keeps server markup and first client render in agreement.

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { generatePlan } from '@/lib/engine'
import type { PlanInput, PlanItemStatus, PlanResult } from '@/lib/domain/types'

export type Answers = Omit<PlanInput, 'today'>

// Item statuses are still local. They become rows in the check-in step, where a
// plan item gets a stable id to attach a status to.
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
  plan: PlanResult | null
  planError: string | null
  today: string
  statuses: Record<string, PlanItemStatus>
  setStatus: (itemKey: string, status: PlanItemStatus) => void
}

const PlanContext = createContext<PlanContextValue | null>(null)

export function PlanProvider({
  answers,
  children,
}: {
  answers: Answers
  children: ReactNode
}) {
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

  const statuses = useMemo(
    () => parse<Record<string, PlanItemStatus>>(rawStatuses) ?? {},
    [rawStatuses],
  )

  const setStatus = useCallback(
    (key: string, status: PlanItemStatus) => {
      statusStore.write(JSON.stringify({ ...statuses, [key]: status }))
    },
    [statuses],
  )

  const { plan, planError } = useMemo(() => {
    if (clock === null) return { plan: null, planError: null }
    try {
      return {
        plan: generatePlan({ ...answers, today: clock }),
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
