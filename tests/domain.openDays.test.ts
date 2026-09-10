// The days the app still knows nothing about, and how it says so.
//
// Both halves are tested because both halves are product rules. The boundaries
// decide whether the learning loop ever gets data; the phrasing decides whether
// somebody feels asked or accused, and CLAUDE.md is explicit that the second is
// not allowed ("Rückschläge sind Lernsignal, keine Schuldmechanik").

import { describe, expect, it } from 'vitest'
import {
  answerablePastItems, openDaysSentence, openPastDays, type DayItem,
} from '@/lib/domain/openDays'

const TODAY = '2026-09-10'

const item = (over: Partial<DayItem>): DayItem => ({
  scheduledOn: '2026-09-08',
  status: 'unknown',
  ...over,
})

describe('which days count as open', () => {
  it('collects past days that still hold an unanswered action', () => {
    const days = openPastDays(
      [item({ scheduledOn: '2026-09-07' }), item({ scheduledOn: '2026-09-08' })],
      TODAY,
    )
    expect(days).toEqual(['2026-09-07', '2026-09-08'])
  })

  it('returns them oldest first, which is the order they get filled in', () => {
    const days = openPastDays(
      [item({ scheduledOn: '2026-09-09' }), item({ scheduledOn: '2026-09-07' })],
      TODAY,
    )
    expect(days).toEqual(['2026-09-07', '2026-09-09'])
  })

  it('lists a day once however many actions are open on it', () => {
    const days = openPastDays(
      [item({ scheduledOn: '2026-09-08' }), item({ scheduledOn: '2026-09-08' })],
      TODAY,
    )
    expect(days).toEqual(['2026-09-08'])
  })

  it('never includes today, whatever is still open on it', () => {
    // Today is not something to catch up on. Its actions are on the screen
    // already, and offering to "fill in" the day somebody is standing in is
    // the app misreading the clock.
    expect(openPastDays([item({ scheduledOn: TODAY })], TODAY)).toEqual([])
  })

  it('never includes a day that has not happened', () => {
    expect(openPastDays([item({ scheduledOn: '2026-09-12' })], TODAY)).toEqual([])
  })

  it.each(['done', 'missed', 'not_relevant', 'moved'])(
    'does not count a day whose actions are all %s',
    (status) => {
      expect(openPastDays([item({ status })], TODAY)).toEqual([])
    },
  )

  it('counts a day where one action is answered and another is not', () => {
    const days = openPastDays(
      [item({ status: 'done' }), item({ status: 'unknown' })],
      TODAY,
    )
    expect(days).toEqual(['2026-09-08'])
  })

  it('ignores standing rules, which are answered in their own card', () => {
    // Counting them would make every past day permanently open — a daily rule
    // is generated for all seven days and nobody ticks a rule for last
    // Tuesday. The line would then never go away, which is the definition of
    // a nag.
    expect(openPastDays([item({ cadence: 'daily' })], TODAY)).toEqual([])
  })
})

describe('what the line says', () => {
  it('says nothing when there is nothing to say', () => {
    expect(openDaysSentence([])).toBeNull()
  })

  it('names one day', () => {
    expect(openDaysSentence(['2026-09-07'])).toBe('Von Montag weiß ich noch nichts.')
  })

  it('names two', () => {
    expect(openDaysSentence(['2026-09-07', '2026-09-08'])).toBe(
      'Von Montag und Dienstag weiß ich noch nichts.',
    )
  })

  it('stops counting after two', () => {
    // Five weekday names in a row is a backlog, and a backlog on the screen
    // somebody opens in the morning is the second job the rules forbid.
    expect(openDaysSentence(['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'])).toBe(
      'Von Samstag, Sonntag und 2 weiteren Tagen weiß ich noch nichts.',
    )
  })

  it('inflects the singular, which is the commonest of these', () => {
    // Three open days is the case this sentence actually hits most, and a
    // rest-count written without thinking says "und 1 weiteren Tagen".
    expect(openDaysSentence(['2026-09-04', '2026-09-05', '2026-09-06'])).toBe(
      'Von Freitag, Samstag und einem weiteren Tag weiß ich noch nichts.',
    )
  })

  it.each([
    ['2026-09-07'],
    ['2026-09-07', '2026-09-08'],
    ['2026-09-05', '2026-09-06', '2026-09-07'],
  ])('is about knowing, never about failing (%s)', (...days) => {
    const sentence = openDaysSentence(days) ?? ''
    // The failure mode this guards is a rewrite that "clarifies" the sentence
    // into a to-do. Every one of these words turns the app into a supervisor.
    expect(sentence).not.toMatch(
      /verpasst|vergessen|versäumt|offen geblieben|nicht (ein)?getragen|nachholen|schuld|leider/i,
    )
    expect(sentence).toMatch(/weiß ich noch nichts/)
  })

  it('never names a number of unanswered actions', () => {
    // A count is a score, and a score is the gamification the brief rules out.
    const sentence = openDaysSentence(['2026-09-07', '2026-09-08']) ?? ''
    expect(sentence).not.toMatch(/\d+\s*(Aktion|Aufgabe|Eintrag)/i)
  })
})

describe('the one filter everything else is built on', () => {
  // openPastDays and the catch-up screen's grouping both go through this. The
  // failure it prevents is a day heading rendered with an empty card under it,
  // which is what two filters drifting apart looks like from the outside.
  it('keeps exactly the rows a day would be listed for', () => {
    const items = [
      item({ scheduledOn: '2026-09-08', status: 'unknown' }),
      item({ scheduledOn: '2026-09-08', status: 'done' }),
      item({ scheduledOn: '2026-09-08', cadence: 'daily' }),
      item({ scheduledOn: TODAY }),
      item({ scheduledOn: '2026-09-12' }),
    ]

    const kept = answerablePastItems(items, TODAY)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ scheduledOn: '2026-09-08', status: 'unknown' })

    // The two agree by construction, and this is the assertion that says so:
    // every day openPastDays names has at least one row that survived the
    // filter, and no day it leaves out has any.
    const days = openPastDays(items, TODAY)
    for (const day of days) {
      expect(kept.some((i) => i.scheduledOn === day)).toBe(true)
    }
    expect(new Set(kept.map((i) => i.scheduledOn))).toEqual(new Set(days))
  })

  it('carries the row through rather than reshaping it', () => {
    // The catch-up screen reads title, domain and track off what comes back, so
    // a filter that narrowed the type would quietly cost the screen its labels.
    const withExtras = { ...item({}), title: 'Ganzkörper', domain: 'training' }
    expect(answerablePastItems([withExtras], TODAY)[0]).toEqual(withExtras)
  })

  it('keeps a planned row, which is unknown by another name', () => {
    // Both statuses mean "nobody has said". materialise writes `unknown`; older
    // rows and the engine's own default say `planned`.
    expect(answerablePastItems([item({ status: 'planned' })], TODAY)).toHaveLength(1)
  })
})
