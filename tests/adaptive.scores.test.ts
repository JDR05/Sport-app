// A ring is a claim about someone's week. These tests are what makes the claim
// defensible — above all, that a quiet week never looks like a bad one.

import { describe, expect, it } from 'vitest'
import { scoreOf, weekScores } from '@/lib/adaptive/scores'
import { toObservations } from '@/lib/db/observations'
import type { Observation } from '@/lib/adaptive'
import type { PlanItemStatus, PlanDomain } from '@/lib/domain/types'

function obs(status: PlanItemStatus, domain: PlanDomain = 'training'): Observation {
  return {
    itemId: `${status}-${domain}-${Math.random()}`,
    scheduledOn: '2026-08-20',
    domain,
    track: 'goal',
    title: 'x',
    timeSlot: null,
    plannedDurationMin: 30,
    status,
  }
}

describe('what fills a ring', () => {
  it('counts done and moved as done', () => {
    // Moved means it happened, just elsewhere. Counting it as a miss would
    // punish the exact adaptation the app asks people to make.
    expect(scoreOf([obs('done'), obs('moved')]).rate).toBe(1)
  })

  it('counts missed against it', () => {
    expect(scoreOf([obs('done'), obs('missed')]).rate).toBe(0.5)
  })

  it('leaves untouched actions out of the sum entirely', () => {
    // The load-bearing test. An untracked day is missing information, not a
    // failure — a ring that sank on quiet days would punish precisely the
    // weeks someone was struggling.
    const withGaps = scoreOf([obs('done'), obs('unknown'), obs('unknown'), obs('planned')])
    expect(withGaps.rate).toBe(1)
    expect(withGaps.resolved).toBe(1)
    expect(withGaps.untouched).toBe(3)
  })

  it('does not count a planning error as a gap in the week', () => {
    // `not_relevant` says the plan was wrong, not that the person went quiet.
    const score = scoreOf([obs('done'), obs('not_relevant')])
    expect(score.untouched).toBe(0)
    expect(score.rate).toBe(1)
  })

  it('is null rather than zero when nothing was judged', () => {
    // Zero would be a claim. Null is the truth: nothing is known yet.
    const empty = scoreOf([obs('unknown'), obs('unknown')])
    expect(empty.rate).toBeNull()
    expect(empty.resolved).toBe(0)
  })

  it('always reports what the rate rests on', () => {
    // 100% out of two judged actions is honest and misleading at once, so the
    // count travels with the number and the UI shows both.
    const thin = scoreOf([obs('done'), obs('done'), ...Array.from({ length: 7 }, () => obs('unknown'))])
    expect(thin.rate).toBe(1)
    expect(thin.resolved).toBe(2)
    expect(thin.planned).toBe(9)
  })
})

describe('one ring per domain', () => {
  it('splits by domain and leads with the biggest', () => {
    const scores = weekScores([
      obs('done', 'training'),
      obs('missed', 'training'),
      obs('done', 'training'),
      obs('done', 'nutrition'),
    ])

    expect(scores.domains[0].domain).toBe('training')
    expect(scores.domains[0].rate).toBeCloseTo(0.67, 2)
    expect(scores.domains[1].domain).toBe('nutrition')
  })

  it('omits a domain the week does not touch', () => {
    // An area the plan never asked about is not an area someone is failing at,
    // and an empty ring reads as one.
    const scores = weekScores([obs('done', 'training')])
    expect(scores.domains.map((d) => d.domain)).toEqual(['training'])
  })

  it('is empty, not zero, for a week nobody judged', () => {
    const scores = weekScores([obs('unknown'), obs('unknown', 'sleep')])
    expect(scores.overall.rate).toBeNull()
    for (const d of scores.domains) expect(d.rate).toBeNull()
  })
})

describe('on data shaped like the database produces it', () => {
  it('reads straight from stored items', () => {
    const stored = [
      { id: 'a', scheduledOn: '2026-08-20', domain: 'training' as const, track: 'goal' as const,
        title: 'T', timeSlot: null, plannedDurationMin: 30, rationale: { text: 'x', basedOn: ['y'] },
        details: {}, status: 'done' as const },
      { id: 'b', scheduledOn: '2026-08-21', domain: 'training' as const, track: 'goal' as const,
        title: 'T', timeSlot: null, plannedDurationMin: 30, rationale: { text: 'x', basedOn: ['y'] },
        details: {}, status: 'unknown' as const },
    ]
    const scores = weekScores(toObservations(stored))
    expect(scores.overall.rate).toBe(1)
    expect(scores.overall.untouched).toBe(1)
  })
})
