// Today, where the person actually is.
//
// `new Date().toISOString().slice(0, 10)` looks like it yields today's date.
// It yields today's date **in UTC**, and that is a different day for a good
// part of every night in Berlin. Between midnight and two in the morning CEST
// the app would show yesterday's actions; at the Sunday-to-Monday boundary it
// would materialise and show last week's entire plan, and anything ticked off
// would land on last week's rows.
//
// The comment in PlanProvider claimed the clock stays on the client precisely
// to avoid this. It did — and then converted to UTC anyway.
//
// 'en-CA' is the shortest honest way to get YYYY-MM-DD out of Intl, and it
// formats in the local zone unless told otherwise.

export function localToday(now: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Cookie carrying the browser's IANA time zone.
 *
 * The server has no way to know where someone is, and the screens that render
 * on the server — Insights, Progress — must agree with Today about which day
 * and which week it is. Without this they can silently describe a different
 * week than the one the person is looking at.
 *
 * Not security-relevant: the worst a forged value can do is show that account
 * its own data under the wrong date.
 */
export const TIMEZONE_COOKIE = 'plis.tz'

/** Only real zone names, so a junk cookie falls back rather than throwing. */
export function isValidTimeZone(value: string | undefined): value is string {
  if (!value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value })
    return true
  } catch {
    return false
  }
}
