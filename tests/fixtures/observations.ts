// Observation fixtures for the adaptive engine.
//
// Everything is built from explicit weeks so that "the misses span two weeks"
// is visible in the test, not hidden in a helper.

import { addDays } from '@/lib/engine/dates'
import { WEEKDAYS, type PlanDomain, type PlanItemStatus, type TimeSlot, type Weekday } from '@/lib/domain/types'
import type { Observation } from '@/lib/adaptive'

/** Mondays. TODAY in the profile fixtures is Monday 2026-08-17. */
export const WEEK_STARTS = ['2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10'] as const

/**
 * The Monday of the week TODAY sits in.
 *
 * Every week above is deliberately in the past — that is what makes them
 * evidence for detection. Plan care works on the week someone is actually in,
 * so anything testing it has to say so.
 */
export const THIS_WEEK_START = '2026-08-17'

type Spec = {
  day: Weekday
  status: PlanItemStatus
  domain?: PlanDomain
  timeSlot?: TimeSlot | null
  minutes?: number | null
  title?: string
}

export function weekOf(weekStart: string, specs: Spec[]): Observation[] {
  return specs.map((spec, index) => ({
    itemId: `${weekStart}-${spec.day}-${index}`,
    scheduledOn: addDays(weekStart, WEEKDAYS.indexOf(spec.day)),
    domain: spec.domain ?? 'training',
    track: 'goal' as const,
    title: spec.title ?? 'Training',
    timeSlot: spec.timeSlot === undefined ? 'evening' : spec.timeSlot,
    plannedDurationMin: spec.minutes === undefined ? 45 : spec.minutes,
    status: spec.status,
  }))
}

/** The same weekly pattern repeated over `weeks` weeks. */
export function repeat(specs: Spec[], weeks: number = WEEK_STARTS.length): Observation[] {
  return WEEK_STARTS.slice(0, weeks).flatMap((start) => weekOf(start, specs))
}

/**
 * The canonical case from docs/ADAPTIVE_ENGINE.md: Wednesday collides with this
 * person's life, the rest of the week works.
 */
export const WEDNESDAY_PROBLEM: Observation[] = repeat([
  { day: 'mon', status: 'done' },
  { day: 'wed', status: 'missed' },
  { day: 'sat', status: 'done' },
])
