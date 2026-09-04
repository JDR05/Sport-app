// Which day a check-in may be recorded for.
//
// Heute can now be moved across the week, so somebody can go back to Mittwoch
// and say how that day actually went — which is the point: "somit kann ich noch
// Notizen einfügen oder den Teil wie war dein Tag bearbeiten und die KI weiß
// dann mehr."
//
// Backwards is exactly what that is for. Forwards is not. A check-in is a
// report on a day that happened, and the adaptive engine reads it as evidence:
// energy, stress, sleep and how the eating went are what a pattern is built
// from. A row saying next Friday was a five would be evidence about a day
// nobody has lived, and nothing downstream could tell it apart from a real one.
//
// So this is deterministic code and not a disabled button. The screen already
// refuses to offer the control; this refuses to store the row. Principle 1 —
// a rule that only exists in the interface is a rule that holds until the first
// stale tab, retry or replayed request.

/**
 * How far ahead of the server's date a check-in may still be accepted.
 *
 * One day, and it is about clocks rather than about permission. `serverToday`
 * reads the person's own timezone from a cookie, but falls back to UTC when
 * that cookie has not arrived yet — the first render after a fresh sign-in.
 * Somebody in Auckland checking in on their Tuesday evening would then be
 * refused their own day. A day of slack covers every zone on earth and still
 * makes "check in for next Friday" impossible.
 */
export const CHECK_IN_LOOKAHEAD_DAYS = 1

/**
 * Whether a check-in for `date` may be stored, given the server's date.
 *
 * Both dates are ISO (YYYY-MM-DD), which compare correctly as strings — that
 * is why this needs no Date arithmetic and cannot drift with a timezone.
 */
export function canCheckInOn(date: string, serverDate: string): boolean {
  return date <= addDaysIso(serverDate, CHECK_IN_LOOKAHEAD_DAYS)
}

/** Local, so this module stays free of the engine and its imports. */
function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
