// The week, at week level.
//
// Plan used to be a second Heute: every day expandable, every action
// answerable, the same rings and the same reasoning. That was right while Heute
// could only show today. Heute steps across the week now, so the Product Owner
// asked the obvious question — "der Abschnitt Plan ist eigentlich dann
// überflüssig, da wir ja alles in Heute haben."
//
// It is not, but the reason is narrow: Heute cannot answer "was kommt als
// Nächstes" without tapping through seven days. So Plan keeps exactly that job
// and loses the rest. These tests hold both halves of that decision — the row
// still says what is on the day and what is behind, and it no longer edits
// anything.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { canAnswer, dayPosition, openCount } from '@/lib/domain/weekDays'
import type { Commitment, PlanItemStatus, PlannedItem } from '@/lib/domain/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

const { PlanDay, daySummary } = await import('@/components/PlanDay')

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

function day(over: Partial<Parameters<typeof PlanDay>[0]> = {}) {
  return renderToStaticMarkup(
    <PlanDay
      weekday="thu"
      date="2026-09-03"
      items={[item()]}
      fixed={[]}
      position="today"
      href="/today?tag=2026-09-03"
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
    // The safe reading in both directions: nothing becomes answerable on a
    // guess, and no day is marked as behind on one either.
    for (const date of ['2026-09-01', '2026-09-03', '2026-09-06']) {
      expect(dayPosition(date, null)).toBe('future')
      expect(canAnswer(dayPosition(date, null))).toBe(false)
    }
  })
})

describe('what may be answered', () => {
  // The rule lives in one module because two screens read it now. Written
  // twice, the second copy drifts, and a day answerable on Heute but marked
  // untouchable on Plan just looks like a confused app.
  it('lets the person correct today and every day before it', () => {
    expect(canAnswer('past')).toBe(true)
    expect(canAnswer('today')).toBe(true)
  })

  it('refuses a day that has not happened', () => {
    // An action that has not happened cannot have been missed, and the
    // adaptive engine would take the answer as behaviour.
    expect(canAnswer('future')).toBe(false)
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

describe('the row goes somewhere instead of opening', () => {
  it('links to Heute on that day', () => {
    // The whole point of the change: one place to record, one to survey.
    expect(day({ date: '2026-09-02', href: '/today?tag=2026-09-02' })).toContain(
      'href="/today?tag=2026-09-02"',
    )
  })

  it('carries no controls of its own', () => {
    // Plan was a second editor. If a ring or an answer button reappears here,
    // the duplication is back and the two screens can disagree about a status.
    const markup = day({ position: 'past' })
    expect(markup).not.toContain('als erledigt markieren')
    expect(markup).not.toContain('<button')
  })

  it('does not repeat the reasoning that belongs on the day itself', () => {
    expect(day()).not.toContain('nach der Vorlesung')
  })
})

describe('a row still says what is on the day', () => {
  it('names the fixed appointment before what the app planned', () => {
    const markup = day({ fixed: [FOOTBALL] })
    expect(markup).toContain('Fußballtraining')
    expect(markup.indexOf('Fußballtraining')).toBeLessThan(markup.indexOf('Krafttraining'))
  })

  it('carries the count, so the week has a shape without being opened', () => {
    const markup = day({ items: [item({ id: 'a', status: 'done' }), item({ id: 'b' })] })
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

  it('marks the day the person is in', () => {
    expect(day({ position: 'today' })).toContain('aria-current="date"')
    expect(day({ position: 'past' })).not.toContain('aria-current="date"')
  })
})
