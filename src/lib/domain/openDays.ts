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

/** An action, as this needs to see it. */
export type DayItem = {
  scheduledOn: string
  status: string
  /** Standing rules are excluded: they are answered in their own card. */
  cadence?: string
}

/**
 * Past days in the loaded week that still hold an unanswered action.
 *
 * Oldest first, because that is the order somebody fills them in and because
 * the oldest is the one closest to being forgotten for good.
 *
 * Today is never included, whatever is still open on it. Today is not something
 * to catch up on — it is the day, and the actions are already on the screen.
 */
export function openPastDays(items: readonly DayItem[], today: string): string[] {
  const days = new Set<string>()
  for (const item of items) {
    if (item.scheduledOn >= today) continue
    if (item.cadence === 'daily') continue
    if (item.status !== 'unknown' && item.status !== 'planned') continue
    days.add(item.scheduledOn)
  }
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

  const rest = names.length - 2
  return `Von ${names[0]}, ${names[1]} und ${rest} weiteren Tagen weiß ich noch nichts.`
}

/** The day the button goes to: the oldest, for the reason above. */
export function nextDayToFill(days: readonly string[]): string | null {
  return days[0] ?? null
}
