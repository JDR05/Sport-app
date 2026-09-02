// What the app does the moment somebody says an action did not happen.
//
// The status was stored and nothing followed. That is the most
// information-rich moment this app ever gets — the person is present, has just
// said something true, and is open to exactly one question — and it went by in
// silence. Then, days later, detection guessed at the reason from weekdays and
// time slots. "Three Wednesdays missed, so Wednesdays are hard" is a guess;
// "zu müde, three times" is a fact.
//
// The reaction is deterministic on purpose, and that is not a compromise. It
// changes somebody's plan, so it is bound by the same limits as the plan
// itself (principle 1): a moved action lands on a real free day, a shortened
// one never goes under the viable minimum, and nothing here can add load. The
// model's part comes later and is larger — it finally knows *why*, which is
// what the weekly impulse and the pattern detection have been missing.

import { addDays, weekdayOf } from '@/lib/engine/dates'
import { MAX_ITEMS_PER_DAY, MIN_VIABLE_SESSION_MINUTES } from '@/lib/engine/constants'
import { WEEKDAY_LABELS } from './labels'
import type { Observation } from './types'
import type { PlanDomain, PlanItemStatus, Weekday } from '@/lib/domain/types'

/**
 * The reasons somebody can give with one tap.
 *
 * Deliberately short, and deliberately not a mood scale. Each one has to lead
 * somewhere different — a list where three entries produce the same reaction
 * is a list that wastes the tap. `no_desire` earns its place by leading
 * nowhere on purpose: see below.
 */
export const STATUS_REASONS = [
  'no_time',
  'too_tired',
  'no_desire',
  'away',
  'unwell',
  'too_much',
  'other',
] as const

export type StatusReason = (typeof STATUS_REASONS)[number]

export const REASON_LABELS: Record<StatusReason, string> = {
  no_time: 'Keine Zeit',
  too_tired: 'Zu müde',
  no_desire: 'Keine Lust',
  away: 'War unterwegs',
  unwell: 'Ging mir nicht gut',
  too_much: 'War zu viel',
  other: 'Anderes',
}

/**
 * Whether this verdict is worth asking about.
 *
 * Not every answer earns a follow-up question. "Erledigt" needs no
 * explanation, and undoing a verdict is not a verdict — asking there would be
 * the app interrogating somebody for tapping the wrong thing. A pure function
 * rather than a condition inside the card, because it is a product rule and
 * the card is where such rules go to be quietly rewritten.
 */
export function asksForReason(status: PlanItemStatus): boolean {
  return status !== 'done' && status !== 'unknown' && status !== 'planned'
}

/** What the app offers to do about it. `none` is a real answer. */
export type Reaction =
  | { kind: 'none'; message: string }
  | { kind: 'move'; message: string; toDate: string }
  | { kind: 'shorten'; message: string; toMinutes: number }

export type ReactionInput = {
  reason: StatusReason
  /** The action that did not happen. */
  item: { id: string; scheduledOn: string; domain: PlanDomain; plannedDurationMin: number | null }
  /** This week, so a move lands somewhere real. */
  week: Observation[]
  today: string
  weekStart: string
}

/**
 * One reaction, or none.
 *
 * Never invents work. A move relocates an action that already exists, a
 * shorten makes one smaller, and `none` changes nothing. Nothing here can make
 * a week bigger, which is what keeps it out of the compensatory logic
 * CLAUDE.md forbids: "missed today, so do more tomorrow" is exactly the shape
 * that must not exist.
 */
export function reactTo(input: ReactionInput): Reaction {
  // An action from a week that is over cannot be rescued by this week.
  //
  // The Plan screen lets somebody answer any day up to today, and a plan is
  // written once per week and then fixed (ADR-037). Moving last Wednesday's
  // action onto this Saturday would leave a row whose date belongs to one week
  // and whose plan belongs to another — it would disappear from both. The
  // reason is still worth having, so this is a `none` rather than a refusal.
  if (!isInWeek(input.item.scheduledOn, input.weekStart)) {
    return {
      kind: 'none',
      message: 'Notiert. Die Woche ist vorbei — das fließt in die Auswertung ein, nicht in den Plan.',
    }
  }

  switch (input.reason) {
    // Time and absence are about the day, not the action. Moving it is the
    // whole answer, and if there is no free day the honest reply is to say so.
    case 'no_time':
    case 'away':
      return moveOrNothing(input, 'Kein Problem — ich leg sie auf')

    // Tiredness and feeling unwell are about capacity. A later day is the
    // first offer; a shorter version is the fallback, because a smaller
    // session that happens beats a full one that does not.
    case 'too_tired':
    case 'unwell': {
      const moved = moveOrNothing(input, 'Verstanden. Ich leg sie auf')
      if (moved.kind === 'move') return moved
      return shortenOrNothing(input)
    }

    case 'too_much':
      return shortenOrNothing(input)

    // Deliberately does nothing, and says so.
    //
    // "Keine Lust" is the one answer where moving the action is an insult and
    // shortening it is a bribe. The honest response is to take it as
    // information and let it accumulate — three of these in a domain is a
    // finding the weekly impulse can raise, and one is a Tuesday.
    case 'no_desire':
      return {
        kind: 'none',
        message: 'Notiert, ohne Umplanen. Wenn das öfter kommt, schau ich mir an, woran es liegt.',
      }

    case 'other':
      return {
        kind: 'none',
        message: 'Danke — das fließt in die Wochenauswertung ein.',
      }
  }
}

function isInWeek(date: string, weekStart: string): boolean {
  return date >= weekStart && date <= addDays(weekStart, 6)
}

/** A free later day this week, or an honest nothing. */
function moveOrNothing(input: ReactionInput, opener: string): Reaction {
  const day = bestFreeDay(input)
  if (!day) {
    return {
      kind: 'none',
      message: 'Diese Woche ist nichts mehr frei dafür. Ich lass sie stehen und plane neu.',
    }
  }

  const weekday = WEEKDAY_LABELS[weekdayOf(day.date) as keyof typeof WEEKDAY_LABELS] ?? day.date
  // The evidence is named, because a recommendation that cannot point at its
  // input must not exist (principle 4) — and because "warum ausgerechnet
  // Samstag" is the first thing anyone thinks.
  const because =
    day.done !== null
      ? ` — da hast du zuletzt ${day.done} von ${day.resolved} geschafft.`
      : ' — der Tag ist noch frei.'

  return { kind: 'move', message: `${opener} ${weekday}${because}`, toDate: day.date }
}

/** Smaller, never below the point where it stops being worth doing. */
function shortenOrNothing(input: ReactionInput): Reaction {
  const current = input.item.plannedDurationMin ?? 0
  const shorter = Math.max(MIN_VIABLE_SESSION_MINUTES, Math.round((current * 0.6) / 5) * 5)

  if (current === 0 || shorter >= current) {
    return {
      kind: 'none',
      message: 'Kürzer geht es nicht sinnvoll. Ich merke mir, dass es zu viel war.',
    }
  }

  return {
    kind: 'shorten',
    message: `Dann kürzer: ${shorter} statt ${current} Minuten. Etwas, das stattfindet, ist mehr wert als das volle Programm.`,
    toMinutes: shorter,
  }
}

/**
 * The remaining day this week with the best record and room to spare.
 *
 * "Best record" from this person's own history, not from a rule about
 * Saturdays. A day at the item ceiling is not offered, and neither is a day
 * that already carries the same domain — stacking two training sessions
 * because one was missed is the compensation this product refuses.
 */
function bestFreeDay(
  input: ReactionInput,
): { date: string; done: number | null; resolved: number } | null {
  const candidates: Array<{ date: string; done: number | null; resolved: number }> = []

  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(input.weekStart, offset)
    // Today still counts: somebody saying "keine Zeit" at eight in the morning
    // may well have the evening. Yesterday does not.
    if (date < input.today) continue
    if (date === input.item.scheduledOn) continue

    const onDay = input.week.filter((o) => o.scheduledOn === date)
    if (onDay.length >= MAX_ITEMS_PER_DAY) continue
    if (onDay.some((o) => o.domain === input.item.domain)) continue

    candidates.push({ date, ...recordFor(input.week, weekdayOf(date)) })
  }

  if (candidates.length === 0) return null

  // Best rate first; ties go to the earlier day, because sooner is likelier.
  return candidates.sort((a, b) => rate(b) - rate(a) || a.date.localeCompare(b.date))[0]
}

function recordFor(week: Observation[], weekday: Weekday): { done: number | null; resolved: number } {
  const answered = week.filter(
    (o) => weekdayOf(o.scheduledOn) === weekday && (o.status === 'done' || o.status === 'missed'),
  )
  if (answered.length === 0) return { done: null, resolved: 0 }
  return { done: answered.filter((o) => o.status === 'done').length, resolved: answered.length }
}

/** An unproven day sorts in the middle: not promoted, not buried. */
function rate(day: { done: number | null; resolved: number }): number {
  return day.done === null || day.resolved === 0 ? 0.5 : day.done / day.resolved
}
