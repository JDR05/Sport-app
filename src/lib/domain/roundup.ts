// When to offer the whole day at once.
//
// Swiping answers one card. That is right during the day, when actions get
// answered as they happen — and it is the wrong shape for the evening, when
// somebody opens the app once with three cards still open and the honest
// answer is "two yes, one no". Three separate gestures for one thought.
//
// So there is a second path: one card, the day in it, a tick or a cross per
// row. The two are not alternatives — most days will use both, and the reason
// they can coexist is that this one only appears when there is something left
// to answer.

import type { DayPosition } from './weekDays'

/**
 * The hour the evening starts.
 *
 * 17:00, which is early for "evening" and deliberate: the card is a summary of
 * what has happened so far, not a bedtime ritual, and somebody finishing work
 * at five should find it there. It never nags — it appears in the screen they
 * were opening anyway.
 */
export const ROUNDUP_FROM_HOUR = 17

/**
 * Whether the day's round-up is worth showing.
 *
 * Three conditions, and each one is there to stop a specific annoyance:
 *
 *   * something must still be open, or the card is a congratulation nobody
 *     asked for;
 *   * a past day always qualifies, because catching up is the entire reason
 *     the app lets somebody move across the week at all;
 *   * today qualifies only from the evening on, because a card at nine in the
 *     morning asking whether the day went well is the app talking before it
 *     has anything to talk about.
 *
 * A future day never qualifies. Answering for a day that has not happened is
 * not catching up, it is guessing, and the adaptive engine would treat the
 * guess as evidence.
 */
export function shouldOfferRoundup(
  position: DayPosition,
  hour: number,
  openCount: number,
): boolean {
  if (openCount === 0) return false
  if (position === 'past') return true
  if (position === 'future') return false
  return hour >= ROUNDUP_FROM_HOUR
}
