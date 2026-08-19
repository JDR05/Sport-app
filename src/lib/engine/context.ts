// Everything the archetype strategies share.
//
// Built once per plan so each strategy starts from the same view of the week:
// which days are actually free, how long the sessions can be, what had to be
// assumed. Strategies append to `assumptions` and `rationale` as they go.

import {
  FALLBACK,
  MAX_CONSECUTIVE_TRAINING_DAYS,
  MIN_VIABLE_SESSION_MINUTES,
} from './constants'
import { addDays, startOfWeek, timeSlotOf } from './dates'
import {
  WEEKDAYS,
  type Assumption,
  type Experience,
  type FreeSlot,
  type PlanInput,
  type Rationale,
  type TimeSlot,
  type Weekday,
} from '@/lib/domain/types'

export type PlanContext = {
  input: PlanInput
  today: string
  weekStart: string
  experience: Experience
  /** Days with a usable free slot, already minus any hard exclusion. */
  availableDays: Weekday[]
  hardSessionMinutesCap: number | null
  assumptions: Assumption[]
  rationale: Rationale[]
}

export function buildContext(input: PlanInput): PlanContext {
  const assumptions: Assumption[] = []

  const experience = input.profile.sport.experience ?? FALLBACK.experience
  if (input.profile.sport.experience === null) {
    assumptions.push({
      field: 'profile.sport.experience',
      assumed: 'Einsteiger',
      reason:
        'Kein Leistungsstand angegeben. Einsteiger bekommt die vorsichtigste Belastung und die meisten Ruhetage.',
    })
  }

  const excluded = hardExcludedWeekdays(input)
  const availableDays = WEEKDAYS.filter(
    (day) => !excluded.includes(day) && longestSlotOn(input, day) >= MIN_VIABLE_SESSION_MINUTES,
  )

  return {
    input,
    today: input.today,
    weekStart: startOfWeek(input.today),
    experience,
    availableDays,
    hardSessionMinutesCap: hardSessionMinutesCap(input),
    assumptions,
    rationale: [],
  }
}

export function hardExcludedWeekdays(input: PlanInput): Weekday[] {
  const days: Weekday[] = []
  for (const c of input.constraints) {
    if (c.hard && c.value.type === 'no_training_on') days.push(...c.value.weekdays)
  }
  return days
}

function hardSessionMinutesCap(input: PlanInput): number | null {
  let cap: number | null = null
  for (const c of input.constraints) {
    if (c.hard && c.value.type === 'max_session_minutes') {
      cap = cap === null ? c.value.minutes : Math.min(cap, c.value.minutes)
    }
  }
  return cap
}

export function longestSlotOn(input: PlanInput, day: Weekday): number {
  return input.schedule.freeSlots
    .filter((s) => s.weekday === day)
    .reduce((max, s) => Math.max(max, s.minutes), 0)
}

export function bestSlotOn(input: PlanInput, day: Weekday): FreeSlot | null {
  const slots = input.schedule.freeSlots
    .filter((s) => s.weekday === day)
    .sort((a, b) => b.minutes - a.minutes)
  return slots[0] ?? null
}

export function slotOf(input: PlanInput, day: Weekday): TimeSlot | null {
  const slot = bestSlotOn(input, day)
  return slot ? timeSlotOf(slot.start) : null
}

export function dateOf(ctx: PlanContext, day: Weekday): string {
  return addDays(ctx.weekStart, WEEKDAYS.indexOf(day))
}

export function excludedActivities(input: PlanInput) {
  const out = [...input.profile.sport.dislikedActivities]
  for (const c of input.constraints) {
    if (c.value.type === 'no_activity') out.push(c.value.activity)
  }
  return out
}

/**
 * Picks up to `count` weekdays out of the available ones, spread as evenly as
 * availability allows: each pick maximises the circular distance to the days
 * already chosen.
 *
 * A candidate that would create too long a run of training days is skipped
 * rather than accepted — greedy spreading alone does not guarantee this. With
 * six available days and five wanted sessions it happily produces Monday to
 * Friday, which is five in a row. Fewer sessions is the correct answer there;
 * quietly dropping the rest-day rule is not.
 */
export function spreadAcrossWeek(
  available: Weekday[],
  count: number,
  maxRun: number = MAX_CONSECUTIVE_TRAINING_DAYS,
): Weekday[] {
  if (count <= 0 || available.length === 0) return []

  const picked: Weekday[] = []
  while (picked.length < count) {
    let best: Weekday | null = null
    let bestDistance = -1

    for (const day of available) {
      if (picked.includes(day)) continue
      if (longestRun([...picked, day]) > maxRun) continue

      const distance =
        picked.length === 0 ? 0 : Math.min(...picked.map((p) => circularDistance(p, day)))
      if (distance > bestDistance) {
        bestDistance = distance
        best = day
      }
    }

    if (best === null) break
    picked.push(best)
  }

  return WEEKDAYS.filter((d) => picked.includes(d))
}

/**
 * Longest run of active days, counted across the week boundary: weeks repeat,
 * so Saturday–Sunday–Monday is three in a row even though the array wraps.
 */
export function longestRun(days: Weekday[]): number {
  const flags = WEEKDAYS.map((d) => days.includes(d))
  if (flags.every(Boolean)) return 7

  let longest = 0
  let current = 0
  for (const active of [...flags, ...flags]) {
    current = active ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return Math.min(longest, 7)
}

function circularDistance(a: Weekday, b: Weekday): number {
  const raw = Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
  return Math.min(raw, WEEKDAYS.length - raw)
}

/**
 * Days to place non-training actions on. Derived from when the person actually
 * has time rather than hardcoded to Monday and Wednesday — an action parked on
 * a day someone is never free is an action they will not do, and it also makes
 * every plan look the same.
 */
export function pickDays(ctx: PlanContext, count: number): Weekday[] {
  const pool = ctx.availableDays.length > 0 ? ctx.availableDays : [...WEEKDAYS]
  const picked = spreadAcrossWeek(pool, Math.min(count, pool.length), 7)
  return picked.length > 0 ? picked : [WEEKDAYS[0]]
}

export function restDays(activeDays: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => !activeDays.includes(d))
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function formatDecimal(n: number): string {
  return round1(n).toFixed(1).replace('.', ',')
}
