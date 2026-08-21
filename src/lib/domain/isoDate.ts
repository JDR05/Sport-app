// A date that exists.
//
// `/^\d{4}-\d{2}-\d{2}$/` accepts 2026-02-31 and 2026-13-45. Both are the right
// shape and neither is a day, so they pass validation, reach a `date` column,
// and fail there — after the surrounding statements have already run. In
// saveOnboarding that landed a person with no active goal, which the app reads
// as "not onboarded yet" and answers by sending them back through the
// onboarding. A regex on a date is a shape check pretending to be a value
// check.
//
// Round-tripping through Date is the cheap way to be sure: February the 31st
// normalises to March the 3rd, so the strings stop matching.

import { z } from 'zod'

const SHAPE = /^\d{4}-\d{2}-\d{2}$/

export function isRealDate(value: string): boolean {
  if (!SHAPE.test(value)) return false
  // Parsed as UTC on purpose: the whole app stores plain dates and never a
  // local timestamp, so nothing here may depend on where the server stands.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** 'YYYY-MM-DD', and a day the calendar actually has. */
export const isoDate = z.string().refine(isRealDate, {
  message: 'Kein gültiges Datum',
})
