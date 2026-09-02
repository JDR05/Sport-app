// The week somebody already has, on the screens that show a day.
//
// The engine has known about commitments since ADR-042 — `sportDays` is why no
// second session is planned on the evening somebody plays football. The
// screens did not: Today showed an empty day and the week view said "Ruhetag",
// so the largest thing in that person's week was invisible in the app that is
// about their week. These tests are about that gap, and about the two rules
// that keep the fix honest.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { commitmentsForDay } from '@/components/DayCommitments'
import type { Commitment } from '@/lib/domain/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

const { DayCommitments, CommitmentLine } = await import('@/components/DayCommitments')

const FOOTBALL: Commitment = {
  label: 'Fußballtraining',
  weekday: 'tue',
  start: '19:00',
  minutes: 90,
  kind: 'sport',
  activity: 'football',
}

const SHIFT: Commitment = {
  label: 'Spätschicht',
  weekday: 'tue',
  start: '14:00',
  minutes: 480,
  kind: 'work',
  activity: null,
}

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element)

describe('picking the day', () => {
  it('shows only what is on that weekday', () => {
    const week = [FOOTBALL, { ...FOOTBALL, weekday: 'thu' as const, label: 'Spiel' }]
    expect(commitmentsForDay(week, 'tue').map((c) => c.label)).toEqual(['Fußballtraining'])
    expect(commitmentsForDay(week, 'wed')).toEqual([])
  })

  it('puts the earlier one first, so the day reads in order', () => {
    expect(commitmentsForDay([FOOTBALL, SHIFT], 'tue').map((c) => c.start)).toEqual([
      '14:00',
      '19:00',
    ])
  })

  it('does not reorder the caller’s array', () => {
    // The week comes from the plan and is rendered in several places; sorting
    // it in place would quietly change what another screen shows.
    const week = [FOOTBALL, SHIFT]
    commitmentsForDay(week, 'tue')
    expect(week[0].label).toBe('Fußballtraining')
  })
})

describe('what a commitment looks like', () => {
  it('names it, with the time it actually takes', () => {
    const html = render(<DayCommitments commitments={[FOOTBALL]} weekday="tue" />)
    expect(html).toContain('Fußballtraining')
    expect(html).toContain('19:00')
    expect(html).toContain('90')
  })

  it('says why there is nothing to tick next to it', () => {
    // Without this line the card reads as an action somebody forgot to mark.
    // The app did not choose this and cannot judge it: missing your own
    // football is not the plan failing, and counting it would put something
    // the app never decided into the evidence it learns from.
    const html = render(<DayCommitments commitments={[FOOTBALL]} weekday="tue" />)
    expect(html).toContain('Dein fester Termin')
    expect(html).toContain('kein zusätzliches Training')
  })

  it('does not promise a training explanation for a shift', () => {
    const html = render(<DayCommitments commitments={[SHIFT]} weekday="tue" />)
    expect(html).toContain('plant um diese Zeit herum')
    expect(html).not.toContain('kein zusätzliches Training')
  })

  it('renders nothing on a day with none', () => {
    expect(render(<DayCommitments commitments={[FOOTBALL]} weekday="wed" />)).toBe('')
  })

  it('carries no checkbox, ring or status control', () => {
    // The strongest form of the rule above: not "it says it is not tickable"
    // but "there is nothing to tick".
    const html = render(<DayCommitments commitments={[FOOTBALL]} weekday="tue" />)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('aria-pressed')
    expect(html).not.toContain('type="checkbox"')
  })
})

describe('the week view', () => {
  it('shows the same commitment in less space', () => {
    const html = render(<CommitmentLine commitment={FOOTBALL} />)
    expect(html).toContain('Fußballtraining')
    expect(html).toContain('19:00')
    expect(html).toContain('dein Termin')
    expect(html).not.toContain('<button')
  })
})

describe('the design rules these cards must not break', () => {
  const everything = [
    render(<DayCommitments commitments={[FOOTBALL, SHIFT]} weekday="tue" />),
    render(<CommitmentLine commitment={FOOTBALL} />),
  ].join('\n')

  it('actually rendered something', () => {
    expect(everything.length).toBeGreaterThan(500)
  })

  it.each([
    ['a pill radius', /rounded-full/],
    ['a shadow', /shadow-(sm|md|lg|xl)/],
    ['a hard-coded colour', /(class|Name)="[^"]*(?:bg|text|border)-\[#/],
  ])('uses no %s', (_case, pattern) => {
    expect(everything).not.toMatch(pattern)
  })

  it('sets every number in the mono', () => {
    // The line between what the app says and what it measured. A start time
    // and a duration are both things you could check with a clock.
    expect(everything).toContain('num')
  })
})
