'use client'

// Client-side plan state.
//
// The week now comes from the server as rows, not from a computation done here.
// That is what gives every action a stable identity, which is the precondition
// for ticking it off — "the third item on Tuesday" stops being the same thing
// the moment the engine changes its mind about Tuesday.
//
// The clock stays on the client and is the reason this is a fetch rather than
// server-rendered props: the server runs in UTC, and someone opening the app at
// half past midnight in Berlin would otherwise be handed yesterday's week. So
// the client tells the server which day it is, once, and the server materialises
// that week.
//
// The clock is read through useSyncExternalStore rather than an effect, which
// keeps server markup and first client render in agreement.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { loadWeek, setItemStatus } from '@/app/(app)/actions'
import type { StoredItem, StoredWeek } from '@/lib/db/week-plan'
import type { PlanItemStatus } from '@/lib/domain/types'

// Strings compare by value, so a fresh one per call is stable enough for
// useSyncExternalStore. Null on the server marks "clock not known yet".
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

type PlanContextValue = {
  /** False while the clock is unknown or the week is still being fetched. */
  ready: boolean
  week: StoredWeek | null
  /** Set when a safety invariant refused the plan. Shown, never swallowed. */
  planError: string | null
  today: string
  setStatus: (itemId: string, status: PlanItemStatus) => void
}

const PlanContext = createContext<PlanContextValue | null>(null)

export function PlanProvider({ children }: { children: ReactNode }) {
  const today = useSyncExternalStore(
    clockStore.subscribe,
    clockStore.getSnapshot,
    clockStore.getServerSnapshot,
  )

  const [week, setWeek] = useState<StoredWeek | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (today === null) return
    let current = true

    // Not setState-in-an-effect: this resolves after a round trip, and the
    // guard drops the answer if the day changed underneath it.
    void loadWeek(today).then((result) => {
      if (!current) return
      if (result.ok) {
        setWeek(result.week)
        setPlanError(null)
      } else if (result.reason === 'unsafe') {
        setPlanError(result.message)
      }
      setLoaded(true)
    })

    return () => {
      current = false
    }
  }, [today])

  /**
   * Optimistic, and deliberately so: tapping "done" must feel instant. If the
   * write fails the value is put back, so the screen never claims something was
   * recorded that was not.
   */
  const setStatus = useCallback(
    (itemId: string, status: PlanItemStatus) => {
      let previous: PlanItemStatus | undefined
      setWeek((current) => {
        if (!current) return current
        return {
          ...current,
          items: current.items.map((item) => {
            if (item.id !== itemId) return item
            previous = item.status
            return { ...item, status }
          }),
        }
      })

      void setItemStatus(itemId, status).then((result) => {
        if (result.ok || previous === undefined) return
        setWeek((current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === itemId ? { ...item, status: previous as PlanItemStatus } : item,
                ),
              }
            : current,
        )
      })
    },
    [],
  )

  const value: PlanContextValue = useMemo(
    () => ({
      ready: today !== null && loaded,
      week,
      planError,
      today: today ?? '1970-01-01',
      setStatus,
    }),
    [today, loaded, week, planError, setStatus],
  )

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider')
  return ctx
}

export type { StoredItem, StoredWeek }
