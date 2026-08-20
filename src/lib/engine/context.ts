// Everything the archetype strategies share.
//
// Built once per plan so each strategy starts from the same view of the week:
// which days are actually free, how long the sessions can be, what had to be
// assumed. Strategies append to `assumptions` and `rationale` as they go.

import {
  FALLBACK,
  MAX_CONSECUTIVE_TRAINING_DAYS,
  MIN_REST_DAYS,
  MIN_VIABLE_SESSION_MINUTES,
} from './constants'
import { commitmentsOn, freeSlotsMinusCommitments, sportDays } from './commitments'
import { addDays, startOfWeek, timeSlotOf } from './dates'
import { applyDayRules, readRules, type ActiveRules } from './rules'
import {
  WEEKDAYS,
  type Assumption,
  type Commitment,
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
   * Where a training session may be placed: the available days minus the days
   * that already carry sport. Someone with football on Tuesday does not need a
   * second session that evening — they need the rest of the week planned
   * around the one they already have.
   */
  trainingDays: Weekday[]
  /** Fixed appointments, as given. Strategies quote them back to the user. */
  commitments: Commitment[]
  /**
   * Training the week already contains before the app plans anything. Counts
   * against the weekly session budget and against the rest-day rules, because
   * a football match is training whether or not this app suggested it.
   */
  committedSessions: number
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

export function buildContext(raw: PlanInput): PlanContext {
  const assumptions: Assumption[] = []

  // Committed time is removed once, here, rather than at each of the places
  // that read a slot. Every downstream helper — longestSlotOn, bestSlotOn,
  // slotOf — then works on time that is genuinely free, and none of them can
  // forget to ask. What is left is the real week, not the offered one.
  const commitments = raw.schedule.commitments
  const input: PlanInput = {
    ...raw,
    schedule: {
      ...raw.schedule,
      freeSlots: freeSlotsMinusCommitments(raw.schedule.freeSlots, commitments),
    },
  }

  const alreadySporting = sportDays(commitments)

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

  // Sport that is already in the week is not a slot to fill — it is a session
  // that exists. Planning another one onto the same day is the "twice on
  // Tuesday" problem, and it is also how a rest-day rule gets broken without
  // anything noticing.
  const trainingDays = availableDays.filter((d) => !alreadySporting.includes(d))
  if (alreadySporting.length > 0) {
    const named = alreadySporting
      .map((d) => `${WEEKDAY_LABEL[d]} ${commitmentsOn(commitments, d).map((c) => c.label).join(' und ')}`)
      .join(', ')
    rationale.push({
      text:
        `Du trainierst schon fest: ${named}. Das ist Training — der Plan legt an diesen Tagen ` +
        `nichts obendrauf, zählt es als Belastung mit und plant nur noch das dazu, was auf ` +
        `dein Ziel einzahlt. Wenn du zusätzlich zu diesen Terminen trainieren willst, trag ` +
        `dein Wochenziel höher ein.`,
      basedOn: ['schedule.commitments'],
    })
  }

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
    trainingDays,
    commitments,
    committedSessions: alreadySporting.length,
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
 * How many sessions to plan, and where, given what the week already holds.
 *
 * One place rather than three. All three training archetypes had the same four
 * lines, and each of them had to be taught about commitments separately — which
 * is exactly the kind of duplication that ends with two of them right and one
 * quietly wrong.
 *
 * Committed sport counts twice over, and both readings are deliberate:
 *
 *   * Against the **rest** budget. You are not recovering on the evening you
 *     play football, whatever your goal is.
 *   * Against the **session target**. "Three times a week" is a statement about
 *     a person's whole week, not about this app's share of it, so three club
 *     sessions largely satisfy it.
 *
 * `minSessions` is what stops the second reading from going too far. Football
 * is training, but it is not gym work — so a strength goal, or a deficit that
 * needs muscle kept, still gets at least one session of its own kind. A plan
 * that answers "get stronger" with no strength in it is not a plan.
 */
export function planTrainingDays(
  ctx: PlanContext,
  desired: number,
  minSessions = 0,
  /** Endurance carries its own floor; everything else uses the experience one. */
  minRestDays: number = MIN_REST_DAYS[ctx.experience],
): { weekdays: Weekday[]; planned: number; total: number } {
  const alreadySporting = sportDays(ctx.commitments)

  const maxByRest = 7 - minRestDays
  const restRoom = Math.max(0, maxByRest - ctx.committedSessions)
  const stillWanted = Math.max(0, desired - ctx.committedSessions)

  const wanted = Math.max(
    Math.min(minSessions, ctx.trainingDays.length, restRoom),
    Math.min(stillWanted, ctx.trainingDays.length, restRoom),
  )

  // The count comes back out of the placement, never out of the request.
  // spreadAcrossWeek returns fewer days than asked whenever placing another one
  // would break the run limit, and reporting the request instead produced
  // headlines like "3x Kraft" above a week containing two.
  const weekdays = spreadAcrossWeek(
    ctx.trainingDays,
    wanted,
    MAX_CONSECUTIVE_TRAINING_DAYS,
    alreadySporting,
  )

  return {
    weekdays,
    planned: weekdays.length,
    total: weekdays.length + ctx.committedSessions,
  }
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
  occupied: Weekday[] = [],
): Weekday[] {
  if (count <= 0 || available.length === 0) return []

  // Days that already carry training count towards a run but are never picked.
  // Without this, football on Tuesday and Friday plus planned sessions on
  // Wednesday and Thursday reads as two short runs when it is really four
  // training days in a row.
  const picked: Weekday[] = []
  while (picked.length < count) {
    let best: Weekday | null = null
    let bestDistance = -1

    for (const day of available) {
      if (picked.includes(day)) continue
      if (longestRun([...occupied, ...picked, day]) > maxRun) continue

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
