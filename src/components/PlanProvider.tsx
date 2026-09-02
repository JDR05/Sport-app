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
import { acceptReaction, answerItemStatus, loadWeek, setItemStatus } from '@/app/(app)/actions'
import type { Reaction, StatusReason } from '@/lib/adaptive/reaction'
import type { StoredItem, StoredWeek } from '@/lib/db/week-plan'
import { planStateOf, type PlanState } from '@/components/planState'
import { localToday } from '@/lib/engine/localDate'
import type { PlanItemStatus } from '@/lib/domain/types'

// Strings compare by value, so a fresh one per call is stable enough for
// useSyncExternalStore. Null on the server marks "clock not known yet".
const clockStore = {
  subscribe() {
    return () => {}
  },
  getSnapshot(): string | null {
    return localToday()
  },
  getServerSnapshot(): string | null {
    return null
  },
}

type PlanContextValue = {
  state: PlanState
  week: StoredWeek | null
  /** The invariant message, set only in the `unsafe` state. */
  planError: string | null
  today: string
  setStatus: (itemId: string, status: PlanItemStatus) => void
  /**
   * Records why an action did not happen, and returns what the app offers to
   * do about it. The offer comes from the server, never from here: it changes
   * a plan, so it is subject to the same limits the plan is.
   */
  answer: (
    itemId: string,
    status: PlanItemStatus,
    reason: StatusReason,
    note: string | null,
  ) => Promise<Reaction | null>
  /** Carries out the offer and moves the week to match. */
  accept: (itemId: string) => Promise<Reaction | null>
  /**
   * Actions that left today in the last few seconds, by the day they left.
   *
   * Today renders by date, so an accepted move would make the card vanish
   * mid-sentence — the person taps "Passt" and the confirmation disappears
   * with the thing that was confirmed. Keeping the id here lets the screen
   * hold it in place until the next load, without pretending the move did not
   * happen: the date underneath is already the new one.
   */
  movedAway: Record<string, string>
  /** Load the week again. Only meaningful from `failed`. */
  retry: () => void
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
  const [attempt, setAttempt] = useState(0)

  // What was asked for. An answer belongs to the question it was asked for, so
  // it carries the key it was fetched under — that is what makes "loading" a
  // derived value rather than something an effect has to remember to set back.
  const key = `${today ?? ''}#${attempt}`
  const [answer, setAnswer] = useState<{ key: string; state: PlanState }>({
    key: '',
    state: 'loading',
  })
  const state: PlanState = answer.key === key ? answer.state : 'loading'

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (today === null) return
    let current = true

    // Not setState-in-an-effect: this resolves after a round trip, and the
    // guard drops the answer if the day changed underneath it.
    void loadWeek(today)
      .then((result) => {
        if (!current) return
        if (result.ok) {
          setWeek(result.week)
          setPlanError(null)
        } else {
          setPlanError(result.reason === 'unsafe' ? result.message : null)
        }
        setAnswer({ key, state: planStateOf(result) })
      })
      // A server action that throws — a failed read reported by
      // PlanInputUnavailableError, or the network simply being gone — rejects
      // here. Without this the app sat on an empty screen for ever, and the
      // one thing it could honestly have said was that it did not know.
      .catch(() => {
        if (current) setAnswer({ key, state: 'failed' })
      })

    return () => {
      current = false
    }
  }, [today, key])

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

  const [movedAway, setMovedAway] = useState<Record<string, string>>({})

  /**
   * Deliberately not optimistic, unlike `setStatus`.
   *
   * A tick has one possible outcome and can be shown before the server agrees.
   * A reaction does not: which day is free, and whether any is, is decided
   * from the whole week on the server. Guessing here and correcting a moment
   * later would mean showing somebody a promise and then taking it back.
   */
  const submitAnswer = useCallback(
    async (
      itemId: string,
      status: PlanItemStatus,
      reason: StatusReason,
      note: string | null,
    ): Promise<Reaction | null> => {
      if (today === null) return null

      // The status itself is applied at once, because that part *is* certain.
      setWeek((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === itemId ? { ...item, status } : item,
              ),
            }
          : current,
      )

      const result = await answerItemStatus({ itemId, status, reason, note, today }).catch(
        () => null,
      )
      return result?.reaction ?? null
    },
    [today],
  )

  const accept = useCallback(
    async (itemId: string): Promise<Reaction | null> => {
      if (today === null) return null

      const result = await acceptReaction(itemId, today).catch(() => null)
      const applied = result?.applied
      if (!applied) return null

      setWeek((current) => {
        if (!current) return current
        return {
          ...current,
          items: current.items.map((item) => {
            if (item.id !== itemId) return item
            if (applied.kind === 'move') return { ...item, scheduledOn: applied.toDate }
            if (applied.kind === 'shorten') return { ...item, plannedDurationMin: applied.toMinutes }
            return item
          }),
        }
      })

      if (applied.kind === 'move') {
        setMovedAway((current) => ({ ...current, [itemId]: today }))
      }

      return applied
    },
    [today],
  )

  const value: PlanContextValue = useMemo(
    () => ({
      state,
      week,
      planError,
      today: today ?? '1970-01-01',
      setStatus,
      answer: submitAnswer,
      accept,
      movedAway,
      retry,
    }),
    [today, state, week, planError, setStatus, submitAnswer, accept, movedAway, retry],
  )

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider')
  return ctx
}

export type { StoredItem, StoredWeek }
export type { PlanState }
