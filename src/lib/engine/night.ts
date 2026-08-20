// How much night is actually left.
//
// The engine used to reason about a day as a set of free slots, which makes
// every evening look interchangeable. They are not: an evening that ends a day
// with football until nine, before a morning that starts at five, is already
// spent. Planning into it does not add a session, it removes sleep — and the
// safety rules say the app never does that.
//
// So this computes one number, in one place: given when the last commitment on
// a day ends and when the person has to be up the next morning, how many hours
// are between them. Everything downstream reads that number rather than
// re-deriving it from times, which is how two callers end up disagreeing.
//
// Unknown stays unknown. No wake time means no answer, never a default hour —
// the app would otherwise reason confidently about a number nobody gave it.

import { minutesOfDay } from './commitments'
import { MIN_NIGHT_HOURS, WIND_DOWN_MINUTES } from './constants'
import type { Commitment, Schedule, Weekday } from '@/lib/domain/types'

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** The day after, wrapping the week. */
export function nextWeekday(day: Weekday): Weekday {
  return WEEKDAYS[(WEEKDAYS.indexOf(day) + 1) % WEEKDAYS.length]
}

export type Night = {
  weekday: Weekday
  /** The commitment that decides the evening, always the latest one. */
  because: Commitment
  /** When they could realistically be asleep, minutes since midnight. */
  asleepAt: number
  /** When they have to be up the next morning. */
  wakeAt: number
  hours: number
}

/**
 * The nights that are already short, before the plan adds anything.
 *
 * Both facts have to be present for a day to appear: a commitment that runs
 * into the evening, and a wake time for the morning after. Either one missing
 * is silence, not an estimate.
 */
export function shortNights(schedule: Schedule): Night[] {
  const found: Night[] = []

  for (const weekday of WEEKDAYS) {
    const latest = latestOn(schedule.commitments, weekday)
    if (!latest) continue

    const wake = schedule.wakeTimes[nextWeekday(weekday)]
    if (!wake) continue

    const asleepAt = minutesOfDay(latest.start) + latest.minutes + WIND_DOWN_MINUTES
    const wakeAt = minutesOfDay(wake)

    // A commitment that runs past midnight has already eaten the night; clamp
    // rather than produce a negative one.
    const minutes = Math.max(0, 24 * 60 - asleepAt) + wakeAt
    const hours = minutes / 60
    if (hours <= MIN_NIGHT_HOURS) {
      found.push({ weekday, because: latest, asleepAt, wakeAt, hours })
    }
  }

  return found
}

function latestOn(commitments: Commitment[], weekday: Weekday): Commitment | null {
  const onDay = commitments.filter((c) => c.weekday === weekday)
  if (onDay.length === 0) return null
  return onDay.reduce((latest, c) => (endOf(c) > endOf(latest) ? c : latest))
}

export function endOf(c: Commitment): number {
  return minutesOfDay(c.start) + c.minutes
}

/** 'HH:MM' for a minutes-since-midnight value, wrapping past midnight. */
export function timeOf(minutes: number): string {
  const m = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Hours as the app writes them: one decimal, German comma. */
export function hoursLabel(hours: number): string {
  return `${hours.toFixed(1).replace('.', ',')} h`
}
