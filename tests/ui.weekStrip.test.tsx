// Stepping Heute across the week.
//
// Heute showed one day and there was no way off it. A Wednesday somebody forgot
// to fill in stayed forgotten: the actions could still be answered from Plan,
// but the part that says how the day actually *felt* — energy, stress, sleep,
// the note — had no screen at all once the day was over. That is the half the
// adaptive engine learns the most from.
//
// "Oben wo Freitag steht rüber wechseln können zu den Tagen davor und danach …
//  somit kann ich noch Notizen einfügen oder den Teil wie war dein Tag
//  bearbeiten und die KI weiß dann mehr."
//
// Backwards is the whole point. Forwards is the rule these tests are mostly
// about: a check-in is a report on a day that happened, and the pattern
// detection reads it as evidence.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { canCheckInOn, CHECK_IN_LOOKAHEAD_DAYS } from '@/lib/domain/checkInDay'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

const { WeekStrip } = await import('@/components/WeekStrip')

const MONDAY = '2026-08-31'
const THURSDAY = '2026-09-03'

const draw = (over: Partial<Parameters<typeof WeekStrip>[0]> = {}) =>
  renderToStaticMarkup(
    <WeekStrip
      weekStart={MONDAY}
      selected={THURSDAY}
      today={THURSDAY}
      recorded={new Set()}
      onSelect={() => {}}
      {...over}
    />,
  )

describe('the strip', () => {
  it('offers every day of the week', () => {
    const markup = draw()
    for (const day of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
      expect(markup, day).toContain(`>${day}<`)
    }
  })

  it('marks which day is being shown', () => {
    expect(draw()).toContain('aria-current="date"')
  })

  it('is reachable by its label, not only by sight', () => {
    // Seven identical chips differing by a number are unusable read aloud.
    expect(draw()).toContain('aria-label="Do, 3."')
  })
})

describe('which days already carry an entry', () => {
  it('marks a day that has one', () => {
    // The reason to go back at all. An arrow pair cannot show this, which is
    // why the strip is seven chips rather than two arrows.
    const withMark = draw({ recorded: new Set(['2026-09-02']) })
    expect(withMark).toContain('bg-accent')
  })

  it('marks nothing at all on a week with no entries', () => {
    // Deliberately no cross and no empty ring on the days without one. A
    // missing check-in is missing information, never a failure, and a row of
    // little absences is the guilt mechanic the brief rules out.
    const markup = draw({ recorded: new Set() })
    expect(markup).not.toContain('bg-accent')
  })
})

describe('which days may be reported on', () => {
  it('accepts today and every day before it', () => {
    for (const date of ['2026-09-03', '2026-09-02', '2026-08-31', '2026-01-01']) {
      expect(canCheckInOn(date, THURSDAY), date).toBe(true)
    }
  })

  it('refuses a day that has not happened', () => {
    // Not a disabled button. A row saying next Friday was a five would reach
    // the pattern detection as evidence about a day nobody has lived, and
    // nothing downstream could tell it apart from a real one.
    for (const date of ['2026-09-05', '2026-09-10', '2027-01-01']) {
      expect(canCheckInOn(date, THURSDAY), date).toBe(false)
    }
  })

  it('allows exactly one day of slack, for clocks and not for permission', () => {
    // serverToday falls back to UTC before the timezone cookie arrives, so
    // somebody in Auckland would otherwise be refused their own evening. One
    // day covers every zone on earth; two would let "next Saturday" through on
    // a Thursday.
    expect(CHECK_IN_LOOKAHEAD_DAYS).toBe(1)
    expect(canCheckInOn('2026-09-04', THURSDAY)).toBe(true)
    expect(canCheckInOn('2026-09-05', THURSDAY)).toBe(false)
  })

  it('handles a month and a year boundary', () => {
    // The slack is date arithmetic, and date arithmetic done with string
    // concatenation breaks exactly here.
    expect(canCheckInOn('2026-09-01', '2026-08-31')).toBe(true)
    expect(canCheckInOn('2026-09-02', '2026-08-31')).toBe(false)
    expect(canCheckInOn('2027-01-01', '2026-12-31')).toBe(true)
    expect(canCheckInOn('2027-01-02', '2026-12-31')).toBe(false)
  })
})
