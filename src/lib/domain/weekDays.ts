// Where a day sits relative to the day the person is in, and what follows.
//
// Two screens need this now and they must never disagree. Heute decides from it
// whether an action may be answered; Plan decides from it whether a day is
// marked as behind. When the same rule was written twice — once inline in a
// page and once inside a component — the second copy is the one that quietly
// drifts, and a day that is answerable on one screen and not the other is the
// kind of bug nobody reports because it just looks like the app is confused.

/**
 * How Plan tells Heute which day to open.
 *
 * Here rather than exported from either screen: a page module that Plan
 * imports drags Heute's whole component tree into Plan's bundle, and a page
 * file is meant to export a page.
 */
export const DAY_PARAM = 'tag'

/** Where a day sits relative to the day the person is in. */
export type DayPosition = 'past' | 'today' | 'future'

/**
 * Which of the three a day is.
 *
 * `today === null` means the client's date has not arrived yet. Everything is
 * then `future`, which is the safe reading in both directions: nothing becomes
 * answerable on a guess, and no day is marked as behind on one either.
 */
export function dayPosition(date: string, today: string | null): DayPosition {
  if (today === null) return 'future'
  if (date === today) return 'today'
  return date < today ? 'past' : 'future'
}

/**
 * Whether the actions of this day may be answered.
 *
 * Everything up to and including today is the person's to correct — that is
 * the whole point of being able to step back through the week. A day that has
 * not happened is not: an action that has not happened cannot have been missed,
 * and the adaptive engine would read the answer as behaviour.
 */
export function canAnswer(position: DayPosition): boolean {
  return position !== 'future'
}

/** How much a day still owes. Only a day that has already passed can owe. */
export function openCount(
  items: Array<{ status: string }>,
  position: DayPosition,
): number {
  if (position !== 'past') return 0
  return items.filter((i) => i.status === 'unknown' || i.status === 'planned').length
}
