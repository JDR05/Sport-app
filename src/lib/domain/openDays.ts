// The days the app still knows nothing about.
//
// Pure, so the phrasing and the boundaries can be tested without a screen —
// and the phrasing matters as much as the boundaries here.
//
// Why this exists, measured. Of 81 planned actions, 58 were never answered, and
// the learning loop needs four resolved instances in a bucket before it will
// say anything. It has therefore never said anything: zero insights, zero
// experiments, zero rules. Broken down by day the cause is not mysterious —
// three days fully tracked, five days barely, one day fully — and the five in
// the middle are exactly the window where the swipe was eating taps.
//
// That bug is fixed. What was missing on top of it is a way to notice: nothing
// on any screen said that Monday and Tuesday were still blank, so a day missed
// once stayed missed for good and the engine lost it permanently.
//
// The tone is the hard part and it is a product rule, not a preference.
// CLAUDE.md: "Rückschläge sind Lernsignal, keine Schuldmechanik", and the app
// "darf sich nicht wie ein zweiter Job anfühlen". So this is written as the
// app's own gap — *it* does not know how Monday went — and never as a list of
// what somebody failed to tick. There is no count of open actions, no badge, no
// streak, and days are offered one at a time rather than as a backlog.

import { WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { weekdayOf } from '@/lib/engine/dates'

/**
 * How far back it is worth asking about.
 *
 * Two weeks, and the limit is about memory rather than about the query. The
 * analysis window is six weeks, so reaching further would technically feed the
 * engine more — but "war die Einheit am Montag vor drei Wochen geschafft?" is a
 * question somebody answers by guessing, and a guess written into the training
 * data is worse than the gap it fills. `unknown` is a supported state
 * everywhere in this product precisely so it can stay unknown.
 *
 * It also keeps an abandoned goal's leftovers out without needing a rule about
 * goals: a goal given up three weeks ago falls outside the window by itself.
 *
 * Here rather than beside the query because the screen shows the number to the
 * person — "aus den letzten 14 Tagen" — and a boundary stated in the interface
 * and enforced in a different file is two numbers waiting to disagree.
 */
export const CATCH_UP_DAYS = 14

/** An action, as this needs to see it. */
export type DayItem = {
  scheduledOn: string
  status: string
  /** Standing rules are excluded: they are answered in their own card. */
  cadence?: string
}

/**
 * The actions somebody could still answer, out of whatever they are handed.
 *
 * The single filter, and everything else here is defined in terms of it. The
 * first version had the rule written twice — once to decide which days count,
 * once to decide which rows to list under each day — and two filters that have
 * to agree are two filters that eventually will not. The visible failure would
 * have been a day heading with an empty card under it, which reads as a
 * rendering bug rather than as a disagreement.
 *
 * Three exclusions, and each is a rule rather than a tidy-up:
 *
 *   * Today and later. Today is not something to catch up on — it is the day,
 *     and its actions are already on the screen.
 *   * Standing rules. A daily rule exists on all seven days and nobody ticks
 *     one for last Tuesday, so counting them would leave every past day
 *     permanently open and the line would never go away.
 *   * Anything already answered. There is nothing to ask.
 */
export function answerablePastItems<T extends DayItem>(
  items: readonly T[],
  today: string,
): T[] {
  return items.filter(
    (item) =>
      item.scheduledOn < today &&
      item.cadence !== 'daily' &&
      (item.status === 'unknown' || item.status === 'planned'),
  )
}

/**
 * Past days that still hold an unanswered action.
 *
 * Oldest first, because that is the order somebody fills them in and because
 * the oldest is the one closest to being forgotten for good.
 */
export function openPastDays(items: readonly DayItem[], today: string): string[] {
  const days = new Set(answerablePastItems(items, today).map((i) => i.scheduledOn))
  return [...days].sort()
}

/**
 * What the line says.
 *
 * Names at most two days and then stops counting. "Von Montag, Dienstag,
 * Mittwoch, Donnerstag und Freitag weiß ich noch nichts" is a backlog, and a
 * backlog on the screen somebody opens in the morning is the second job the
 * rules forbid. Two names and "und zwei weitere" keeps it a sentence.
 *
 * Deliberately in the first person and about knowing rather than about doing.
 * "Du hast Montag nicht eingetragen" is the same fact as a reproach; this is
 * the same fact as a question.
 */
export function openDaysSentence(days: readonly string[]): string | null {
  if (days.length === 0) return null

  const names = days.map((d) => WEEKDAY_LABELS[weekdayOf(d)] ?? '')
  if (names.length === 1) return `Von ${names[0]} weiß ich noch nichts.`
  if (names.length === 2) return `Von ${names[0]} und ${names[1]} weiß ich noch nichts.`

  // "und 1 weiteren Tagen" is what a rest-count written without thinking
  // produces, and it is wrong in the one case that shows up most: three open
  // days. German inflects the noun, so the singular gets its own branch.
  const rest = names.length - 2
  const more = rest === 1 ? 'einem weiteren Tag' : `${rest} weiteren Tagen`
  return `Von ${names[0]}, ${names[1]} und ${more} weiß ich noch nichts.`
}
