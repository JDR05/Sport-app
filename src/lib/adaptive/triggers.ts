// When the app has a reason to speak up, other than the calendar.
//
// The weekly impulse fires on Thursday, once, whatever happened. That is a
// good rhythm for reflection and a bad one for everything else: somebody gives
// the same reason three times on Monday and Tuesday, and the app sits on that
// until Thursday — by which point the week is decided and the impulse is
// history rather than help. Monday to Wednesday it said nothing at all.
//
// So the occasion becomes a first-class thing. A trigger is deterministic, and
// that is the point: whether something happened is a count, not a judgement.
// What to *say* about it is still the model's job, and it is told what the
// occasion was so its impulse is about that rather than about the week in
// general.
//
// Two rules keep this from becoming a notification feed, and both are in the
// signatures rather than left to the caller's discipline: each kind of trigger
// fires at most once per week, and no two impulses land within
// MIN_DAYS_BETWEEN_IMPULSES of each other. An app that comments on everything
// is one people stop reading.

import { MIN_STRENGTH_RATE } from './constants'
import { daysBetween } from '@/lib/engine/dates'
import { DOMAIN_LABELS } from './labels'
import { REASON_LABELS, type StatusReason } from './reaction'
import type { Observation } from './types'
import type { PlanDomain } from '@/lib/domain/types'

/**
 * Why an impulse is being written now.
 *
 * `weekly` is the original Thursday rhythm and stays the default. The other
 * three are events, and each one is something a person would recognise as
 * having happened.
 */
export const IMPULSE_TRIGGERS = [
  'reason_repeated',
  'domain_slipping',
  'going_well',
  'weekly',
] as const

export type ImpulseTrigger = (typeof IMPULSE_TRIGGERS)[number]

export type TriggerFinding = {
  trigger: ImpulseTrigger
  /** German, one line, shown to the model as the occasion. */
  occasion: string
  /** The rows it came from, so the impulse can cite them. */
  evidence: string[]
}

/** Days that must pass between two impulses, whatever else happens. */
export const MIN_DAYS_BETWEEN_IMPULSES = 2

/**
 * The same reason, this many times in one week, is a fact about the week.
 *
 * Three rather than two: two is a coincidence and everybody has one bad pair
 * of days. This is the one threshold in the file that could only exist after
 * ADR-095 — before the reaction there was nothing to count.
 */
export const MIN_REPEATED_REASONS = 3

/** Missed actions in one domain, in one week, before the domain is "slipping". */
export const MIN_DOMAIN_MISSES = 3

/** Completed actions before a good run is worth mentioning at all. */
export const MIN_GOOD_RUN = 5

/** The earliest day of the week the reflective impulse may be written. */
export const WEEKLY_IMPULSE_FROM_DAY = 3

export type TriggerInput = {
  today: string
  weekStart: string
  /** This week's actions, including the days still ahead. */
  week: Observation[]
  /** Reasons the person gave this week, already tallied. */
  reasons: Array<{ reason: StatusReason; domain: string; count: number }>
  /** Triggers already used this week. Each fires at most once. */
  used: ImpulseTrigger[]
  /** When the last impulse was written, for the minimum gap. */
  lastImpulseOn: string | null
}

/**
 * The one occasion worth writing about now, or nothing.
 *
 * Nothing is the expected answer on most days, and that is the whole design.
 * The order below is a priority: what somebody said about themselves outranks
 * what the app counted, a shortfall outranks a good run because it is
 * actionable today, and the calendar comes last.
 */
export function detectTrigger(input: TriggerInput): TriggerFinding | null {
  if (!enoughTimeHasPassed(input)) return null

  const candidates = [
    repeatedReason(input),
    slippingDomain(input),
    goingWell(input),
    weekly(input),
  ]

  for (const found of candidates) {
    if (found && !input.used.includes(found.trigger)) return found
  }
  return null
}

function enoughTimeHasPassed(input: TriggerInput): boolean {
  if (!input.lastImpulseOn) return true
  return daysBetween(input.lastImpulseOn, input.today) >= MIN_DAYS_BETWEEN_IMPULSES
}

/**
 * The same answer, three times.
 *
 * The strongest signal this product has, because it is the only one nobody
 * inferred: the person tapped it, three times, in the moment. "Zu müde,
 * dreimal, alles Training" is a statement; "drei Mittwoche verpasst" is a
 * reading of a calendar.
 */
function repeatedReason(input: TriggerInput): TriggerFinding | null {
  const top = [...input.reasons].sort((a, b) => b.count - a.count)[0]
  if (!top || top.count < MIN_REPEATED_REASONS) return null

  // "Anderes" says nothing by design — it is the escape hatch on the chip row,
  // and three taps of it is three people not wanting to choose, not a pattern.
  if (top.reason === 'other') return null

  const domain = DOMAIN_LABELS[top.domain as PlanDomain] ?? top.domain
  return {
    trigger: 'reason_repeated',
    occasion: `Diese Woche ${top.count}× „${REASON_LABELS[top.reason]}" bei ${domain} — selbst angegeben, nicht abgeleitet.`,
    evidence: [`reason.${top.reason}.${top.domain}`],
  }
}

/** One domain going nowhere, while the week is not over. */
function slippingDomain(input: TriggerInput): TriggerFinding | null {
  const byDomain = new Map<PlanDomain, Observation[]>()
  for (const o of input.week) {
    byDomain.set(o.domain, [...(byDomain.get(o.domain) ?? []), o])
  }

  for (const [domain, items] of byDomain) {
    const missed = items.filter((o) => o.status === 'missed')
    const done = items.filter((o) => o.status === 'done')
    // Only when nothing in that domain worked. Three missed alongside four
    // done is a busy week, not a domain coming apart — and telling somebody
    // their nutrition is slipping in a week they hit it four times is the kind
    // of wrong that costs the app its credibility.
    if (missed.length >= MIN_DOMAIN_MISSES && done.length === 0) {
      return {
        trigger: 'domain_slipping',
        occasion: `${DOMAIN_LABELS[domain] ?? domain}: ${missed.length} Aktionen ausgefallen, keine umgesetzt — und die Woche läuft noch.`,
        evidence: missed.map((o) => o.itemId).slice(0, 6),
      }
    }
  }
  return null
}

/**
 * A run going well, said out loud while it is still running.
 *
 * Deliberately here and not only in the weekly reflection. An app that speaks
 * up when something goes wrong and stays quiet when it goes right is a
 * complaint mechanism, and this product's rule is that setbacks are a signal
 * rather than a charge — which only means something if success is a signal too.
 */
function goingWell(input: TriggerInput): TriggerFinding | null {
  const resolved = input.week.filter((o) => o.status === 'done' || o.status === 'missed')
  const done = resolved.filter((o) => o.status === 'done')

  if (done.length < MIN_GOOD_RUN) return null
  if (done.length / resolved.length < MIN_STRENGTH_RATE) return null

  return {
    trigger: 'going_well',
    occasion: `${done.length} von ${resolved.length} bewerteten Aktionen umgesetzt — das läuft gerade.`,
    evidence: done.map((o) => o.itemId).slice(0, 6),
  }
}

/** The original rhythm, unchanged: from Thursday, once, whatever happened. */
function weekly(input: TriggerInput): TriggerFinding | null {
  const dayOfWeek = daysBetween(input.weekStart, input.today)
  if (dayOfWeek < WEEKLY_IMPULSE_FROM_DAY) return null

  return {
    trigger: 'weekly',
    occasion: 'Rückblick auf die Woche.',
    evidence: [`week.${input.weekStart}`],
  }
}
