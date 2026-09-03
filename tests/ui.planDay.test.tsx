// The week, seen from the day you are in.
//
// The Plan screen drew all seven days expanded, always starting at Monday. On a
// Thursday that is three days of finished work scrolled past before the day the
// person is actually in — and the days before it, which are the only ones that
// can still be corrected, were the ones buried deepest.
//
// These tests hold the three rules that fix comes down to: only today opens by
// default, only days that have happened may be answered, and a closed day still
// says what is on it. The last one is the one worth guarding — a collapse that
// turns the week into seven weekday names is a worse week view than the wall it
// replaced.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Commitment, PlanItemStatus, PlannedItem } from '@/lib/domain/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

const { PlanDay, canAnswer, dayPosition, daySummary, openCount } = await import(
  '@/components/PlanDay'
)

const FOOTBALL: Commitment = {
  label: 'Fußballtraining',
  weekday: 'thu',
  start: '19:00',
  minutes: 90,
  kind: 'sport',
  activity: 'football',
}

function item(over: Partial<PlannedItem & { id: string; status: PlanItemStatus }> = {}) {
  return {
    id: 'i1',
    scheduledOn: '2026-09-03',
    domain: 'training' as const,
    track: 'goal' as const,
    title: '45 Min Krafttraining',
    plannedDurationMin: 45,
    timeSlot: null,
    status: 'unknown' as PlanItemStatus,
    rationale: { text: 'Weil du dienstags nach der Vorlesung Zeit hast.', basedOn: ['schedule'] },
    details: {},
    ...over,
  }
}

const draw = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element)

function day(over: Partial<Parameters<typeof PlanDay>[0]> = {}) {
  return draw(
    <PlanDay
      weekday="thu"
      date="2026-09-03"
      items={[item()]}
      commitments={[]}
      position="today"
      onStatus={() => {}}
      onAnswer={async () => null}
      onAccept={async () => null}
      {...over}
    />,
  )
}

describe('which day is which', () => {
  it('names past, present and future against the day the person is in', () => {
    expect(dayPosition('2026-09-02', '2026-09-03')).toBe('past')
    expect(dayPosition('2026-09-03', '2026-09-03')).toBe('today')
    expect(dayPosition('2026-09-04', '2026-09-03')).toBe('future')
  })

  it('treats the whole week as future while the client date is missing', () => {
    // The safe reading in both directions: nothing opens on a guess, and
    // nothing becomes answerable on one either.
    for (const date of ['2026-09-01', '2026-09-03', '2026-09-06']) {
      expect(dayPosition(date, null)).toBe('future')
      expect(canAnswer(dayPosition(date, null))).toBe(false)
    }
  })
})

describe('what may be answered', () => {
  it('lets the person correct today and every day before it', () => {
    expect(canAnswer('past')).toBe(true)
    expect(canAnswer('today')).toBe(true)
  })

  it('refuses a day that has not happened', () => {
    // Not a display choice. An action that has not happened cannot have been
    // missed, and the adaptive engine would take the answer as behaviour.
    expect(canAnswer('future')).toBe(false)
  })

  it('gives a past day the controls and a future day the plain card', () => {
    expect(day({ position: 'past' })).not.toContain('als erledigt markieren')

    const future = day({ position: 'future' })
    expect(future).not.toContain('als erledigt markieren')
    expect(day({ position: 'today' })).toContain('als erledigt markieren')
  })
})

describe('what is still open', () => {
  it('counts only unanswered actions, and only on days that have passed', () => {
    const items = [item({ id: 'a', status: 'unknown' }), item({ id: 'b', status: 'done' })]
    expect(openCount(items, 'past')).toBe(1)
    expect(openCount(items, 'today')).toBe(0)
    expect(openCount(items, 'future')).toBe(0)
  })

  it('marks the past day that is behind, and never a later one', () => {
    expect(day({ position: 'past' })).toContain('offen')
    expect(day({ position: 'future' })).not.toContain('offen')
  })

  it('says nothing about a past day that is settled', () => {
    expect(day({ position: 'past', items: [item({ status: 'done' })] })).not.toContain('offen')
  })
})

describe('open by default', () => {
  // The action cards live only inside the expanded body; the closed row shows
  // the titles as one summary line, so the domain badge is what separates the
  // two — `>Training<` is the badge, `Krafttraining</span>` is the summary.
  const expanded = (markup: string) =>
    markup.includes('aria-expanded="true"') && markup.includes('>Training<')

  it('opens the day the person is in', () => {
    expect(expanded(day({ position: 'today' }))).toBe(true)
  })

  it('leaves every other day closed', () => {
    expect(expanded(day({ position: 'past' }))).toBe(false)
    expect(expanded(day({ position: 'future' }))).toBe(false)
  })
})

describe('a closed day still says what is on it', () => {
  it('names the fixed appointment before what the app planned', () => {
    const markup = day({ position: 'future', commitments: [FOOTBALL] })
    expect(markup).toContain('Fußballtraining')
    expect(markup.indexOf('Fußballtraining')).toBeLessThan(markup.indexOf('Krafttraining'))
  })

  it('carries the count, so the week has a shape without being read', () => {
    const markup = day({
      position: 'future',
      items: [item({ id: 'a', status: 'done' }), item({ id: 'b' })],
    })
    expect(markup).toContain('1/2')
  })

  it('summarises the appointment, the actions and the standing rules', () => {
    const summary = daySummary(
      [
        { title: '45 Min Krafttraining', cadence: undefined },
        { title: 'Eiweiß zu jeder Mahlzeit', cadence: 'daily' },
        { title: 'Schlafenszeit halten', cadence: 'daily' },
      ],
      [FOOTBALL],
    )
    expect(summary).toBe('Fußballtraining · 45 Min Krafttraining · 2 Tagesregeln')
  })

  it('calls an empty day a rest day rather than nothing', () => {
    expect(daySummary([], [])).toBe('Ruhetag')
  })
})
