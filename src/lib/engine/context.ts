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
import { applyDayRules, readRules, type ActiveRules } from './rules'
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
  /**
   * Hard constraints only. The invariant checks read the constraints
   * themselves, so this stays exactly what the user declared.
   */
  hardSessionMinutesCap: number | null
  /**
   * What a session may actually be: the hard cap, tightened by any learned
   * rule. Strategies plan against this one.
   */
  sessionMinutesCap: number | null
  /** The learned model, already narrowed and confidence-filtered. */
  rules: ActiveRules
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
  const openDays = WEEKDAYS.filter(
    (day) => !excluded.includes(day) && longestSlotOn(input, day) >= MIN_VIABLE_SESSION_MINUTES,
  )

  // Nobody named a free slot. That is the state the onboarding's own
  // "Rest überspringen" button produces, so it is a normal input, not a broken
  // one — and two archetypes used to throw on it, leaving the person on a
  // screen that blamed a safety limit for what was really "you gave me no
  // time", with no route back to the onboarding.
  //
  // Days the user hard-excluded stay excluded: an assumption may fill a gap,
  // never override an answer.
  const assumedDays = openDays.length === 0 ? assumeDays(excluded) : []
  if (assumedDays.length > 0) {
    assumptions.push({
      field: 'schedule.freeSlots',
      assumed: assumedDays.map((d) => WEEKDAY_LABEL[d]).join(', '),
      reason:
        'Keine freien Zeitfenster angegeben. Die App nimmt wenige, kurze Termine an — ' +
        'trag deine echten Zeiten nach, dann wird der Plan genauer.',
    })
  }

  // The personal model is applied here, once, so every archetype inherits it
  // without having to remember to ask.
  const rules = readRules(input.personalRules)
  const { days: availableDays, rationale } = applyDayRules(
    openDays.length > 0 ? openDays : assumedDays,
    rules,
  )

  const hardCap = hardSessionMinutesCap(input)
  const sessionMinutesCap =
    hardCap === null
      ? rules.maxSessionMinutes
      : rules.maxSessionMinutes === null
        ? hardCap
        : Math.min(hardCap, rules.maxSessionMinutes)

  if (rules.maxSessionMinutes !== null && rules.maxSessionMinutes !== hardCap) {
    rationale.push({
      text:
        `Kürzere Einheiten von höchstens ${rules.maxSessionMinutes} Minuten haben bei dir ` +
        `messbar besser funktioniert als lange. Der Plan bleibt darunter.`,
      basedOn: ['personalRules.shorter_sessions'],
    })
  }

  return {
    input,
    today: input.today,
    weekStart: startOfWeek(input.today),
    experience,
    availableDays,
    hardSessionMinutesCap: hardCap,
    sessionMinutesCap,
    rules,
    assumptions,
    rationale,
  }
}

/**
 * The fallback week when no free time was given at all.
 *
 * Three spread days rather than the whole week: the rule for a missing answer
 * is to assume whatever leads to *less* load, and a plan someone can actually
 * keep beats a full one they cannot. Sessions land at the minimum viable
 * length, because no slot length is known either.
 */
function assumeDays(excluded: Weekday[]): Weekday[] {
  const usable = WEEKDAYS.filter((d) => !excluded.includes(d))
  return spreadAcrossWeek(usable, Math.min(3, usable.length))
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
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

/**
 * The slot to use on a given day: normally the longest one, but a learned
 * time-of-day preference wins over length as long as the shorter slot is still
 * usable. Someone who reliably trains in the morning and reliably skips the
 * evening is better served by a short morning slot than a long evening one.
 */
export function bestSlotOn(
  input: PlanInput,
  day: Weekday,
  preferred: TimeSlot | null = null,
): FreeSlot | null {
  const slots = input.schedule.freeSlots
    .filter((s) => s.weekday === day)
    .sort((a, b) => b.minutes - a.minutes)

  if (preferred !== null) {
    const match = slots.find(
      (s) => timeSlotOf(s.start) === preferred && s.minutes >= MIN_VIABLE_SESSION_MINUTES,
    )
    if (match) return match
  }

  return slots[0] ?? null
}

export function slotOf(
  input: PlanInput,
  day: Weekday,
  preferred: TimeSlot | null = null,
): TimeSlot | null {
  const slot = bestSlotOn(input, day, preferred)
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
