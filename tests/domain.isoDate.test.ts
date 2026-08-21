// A date that passes validation must be a date that exists.
//
// The old check was `/^\d{4}-\d{2}-\d{2}$/`. It accepts 2026-02-31, which then
// reaches a `date` column and fails there — after the statements around it have
// already run. In saveOnboarding that left a person with no active goal, and
// the app answers "no goal" by sending them back through the onboarding. The
// symptom looked like a routing bug; it was a shape check standing in for a
// value check.

import { describe, expect, it } from 'vitest'
import { isRealDate, isoDate } from '@/lib/domain/isoDate'

describe('a date the calendar has', () => {
  it.each(['2026-08-21', '2024-02-29', '2026-01-01', '2026-12-31'])('accepts %s', (value) => {
    expect(isRealDate(value)).toBe(true)
    expect(isoDate.safeParse(value).success).toBe(true)
  })

  it.each([
    ['2026-02-31', 'February has no 31st'],
    ['2026-02-30', 'nor a 30th'],
    ['2026-13-45', 'there is no thirteenth month'],
    ['2025-02-29', '2025 is not a leap year'],
    ['2026-04-31', 'April has thirty days'],
    ['2026-00-10', 'there is no month zero'],
    ['2026-01-00', 'nor a day zero'],
  ])('rejects %s — %s', (value) => {
    expect(isRealDate(value)).toBe(false)
    expect(isoDate.safeParse(value).success).toBe(false)
  })

  it.each(['21.08.2026', '2026-8-21', 'morgen', '', '2026-08-21T10:00:00Z'])(
    'rejects the wrong shape: %s',
    (value) => {
      expect(isRealDate(value)).toBe(false)
    },
  )

  it('reads the date as UTC, so the answer does not depend on the server', () => {
    // Every date in this app is a plain day, never a local timestamp. A check
    // that shifted with the machine's zone would accept different dates in
    // different regions.
    expect(isRealDate('2026-01-01')).toBe(true)
    expect(isRealDate('2026-12-31')).toBe(true)
  })
})
