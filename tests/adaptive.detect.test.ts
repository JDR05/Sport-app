// The most important tests in the adaptive engine are the ones asserting that
// nothing happens. Detection that fires too eagerly does not produce a slightly
// worse product — it produces a system that confidently tells people untrue
// things about themselves.

import { describe, expect, it } from 'vitest'
import { completionRate, detectDeviations, planningErrors } from '@/lib/adaptive'
import { MIN_DISTINCT_WEEKS, MIN_RESOLVED_INSTANCES } from '@/lib/adaptive/constants'
import { repeat, weekOf, WEDNESDAY_PROBLEM, WEEK_STARTS } from './fixtures/observations'

describe('a single deviation is not a pattern', () => {
  it('stays silent after one missed action', () => {
    const observations = [
      ...weekOf(WEEK_STARTS[0], [
        { day: 'mon', status: 'done' },
        { day: 'wed', status: 'missed' },
        { day: 'sat', status: 'done' },
      ]),
      ...weekOf(WEEK_STARTS[1], [
        { day: 'mon', status: 'done' },
        { day: 'wed', status: 'done' },
        { day: 'sat', status: 'done' },
      ]),
    ]
    expect(detectDeviations(observations)).toEqual([])
  })

  it('stays silent when every miss falls inside a single week', () => {
    // Four misses is enough instances, but one rough week is one rough week —
    // this is the rule that keeps week 1 free of interventions.
    const observations = [
      ...weekOf(WEEK_STARTS[0], [
        { day: 'wed', status: 'missed' },
        { day: 'wed', status: 'missed' },
        { day: 'wed', status: 'missed' },
        { day: 'wed', status: 'missed' },
        { day: 'mon', status: 'done' },
        { day: 'sat', status: 'done' },
      ]),
      ...weekOf(WEEK_STARTS[1], [
        { day: 'mon', status: 'done' },
        { day: 'sat', status: 'done' },
      ]),
    ]
    const weekday = detectDeviations(observations).filter((d) => d.dimension === 'weekday')
    expect(weekday).toEqual([])
  })

  it('needs enough resolved instances before it says anything', () => {
    const short = repeat(
      [{ day: 'wed', status: 'missed' }, { day: 'mon', status: 'done' }],
      MIN_DISTINCT_WEEKS,
    )
    expect(short.filter((o) => o.status === 'missed').length).toBeLessThan(MIN_RESOLVED_INSTANCES)
    expect(detectDeviations(short).filter((d) => d.dimension === 'weekday')).toEqual([])
  })
})

describe('missing input is not failure', () => {
  it('never derives a pattern from `unknown`', () => {
    // Identical shape to the Wednesday problem, but the user simply did not
    // track. Tracking fatigue must not become a behavioural finding.
    const untracked = repeat([
      { day: 'mon', status: 'done' },
      { day: 'wed', status: 'unknown' },
      { day: 'sat', status: 'done' },
    ])
    expect(detectDeviations(untracked)).toEqual([])
  })

  it('does not let `unknown` dilute a rate either', () => {
    // Excluded from the denominator, not counted as compliance: adding
    // untracked days must leave the numbers exactly as they were.
    const withUntracked = [
      ...WEDNESDAY_PROBLEM,
      ...repeat([{ day: 'thu', status: 'unknown' }, { day: 'fri', status: 'unknown' }]),
    ]
    const before = detectDeviations(WEDNESDAY_PROBLEM).find((d) => d.dimension === 'weekday')
    const after = detectDeviations(withUntracked).find((d) => d.dimension === 'weekday')

    expect(before?.missRate).toBe(after?.missRate)
    expect(before?.resolved).toBe(after?.resolved)
  })

  it('treats `not_relevant` as a planning error, never as a miss', () => {
    const wrongPlan = repeat([
      { day: 'mon', status: 'done' },
      { day: 'wed', status: 'not_relevant' },
      { day: 'sat', status: 'done' },
    ])
    expect(detectDeviations(wrongPlan)).toEqual([])
    expect(planningErrors(wrongPlan)).toHaveLength(WEEK_STARTS.length)
  })
})

describe('contrast', () => {
  it('does not blame a weekday when the person misses everything', () => {
    // The honest reading here is "the plan is too big", not "Wednesday is
    // cursed". Without the contrast threshold the engine would say the latter.
    const missesEverything = repeat([
      { day: 'mon', status: 'missed' },
      { day: 'wed', status: 'missed' },
      { day: 'sat', status: 'missed' },
    ])
    expect(detectDeviations(missesEverything).filter((d) => d.dimension === 'weekday')).toEqual([])
  })

  it('needs something to compare against', () => {
    const onlyWednesdays = repeat([{ day: 'wed', status: 'missed' }])
    expect(detectDeviations(onlyWednesdays).filter((d) => d.dimension === 'weekday')).toEqual([])
  })
})

describe('what it does find', () => {
  it('finds the repeated weekday shortfall', () => {
    const weekday = detectDeviations(WEDNESDAY_PROBLEM).find((d) => d.dimension === 'weekday')

    expect(weekday).toBeDefined()
    expect(weekday?.bucket).toBe('wed')
    expect(weekday?.missed).toBe(4)
    expect(weekday?.resolved).toBe(4)
    expect(weekday?.missRate).toBe(1)
    expect(weekday?.comparisonMissRate).toBe(0)
    expect(weekday?.distinctWeeks).toBe(4)
  })

  it('carries the evidence it was derived from', () => {
    // Principle 4: a recommendation that cannot point at its data must not
    // exist. The database enforces the same thing on insights.
    for (const deviation of detectDeviations(WEDNESDAY_PROBLEM)) {
      expect(deviation.evidence.length).toBeGreaterThan(0)
      expect(deviation.evidence.length).toBe(deviation.missed)
    }
  })

  it('finds a time-of-day shortfall', () => {
    const evenings = repeat([
      { day: 'mon', status: 'done', timeSlot: 'early' },
      { day: 'tue', status: 'done', timeSlot: 'early' },
      { day: 'thu', status: 'missed', timeSlot: 'evening' },
      { day: 'fri', status: 'missed', timeSlot: 'evening' },
    ])
    const slot = detectDeviations(evenings).find((d) => d.dimension === 'time_slot')
    expect(slot?.bucket).toBe('evening')
  })

  it('finds a session-length shortfall', () => {
    const longOnes = repeat([
      { day: 'mon', status: 'done', minutes: 25 },
      { day: 'tue', status: 'done', minutes: 25 },
      { day: 'thu', status: 'missed', minutes: 75 },
      { day: 'sat', status: 'missed', minutes: 75 },
    ])
    const duration = detectDeviations(longOnes).find((d) => d.dimension === 'duration')
    expect(duration?.bucket).toBe('long')
  })

  it('finds a whole domain that is not working', () => {
    const nutritionFails = repeat([
      { day: 'mon', status: 'done', domain: 'training' },
      { day: 'tue', status: 'done', domain: 'training' },
      { day: 'thu', status: 'missed', domain: 'nutrition' },
      { day: 'sat', status: 'missed', domain: 'nutrition' },
    ])
    const domain = detectDeviations(nutritionFails).find((d) => d.dimension === 'domain')
    expect(domain?.bucket).toBe('nutrition')
    expect(domain?.domain).toBe('nutrition')
  })

  it('sorts by contrast, so the strongest signal is acted on first', () => {
    const deviations = detectDeviations(WEDNESDAY_PROBLEM)
    const contrasts = deviations.map((d) => d.missRate - d.comparisonMissRate)
    expect([...contrasts].sort((a, b) => b - a)).toEqual(contrasts)
  })
})

describe('completionRate', () => {
  it('counts moved as done — the action happened, just elsewhere', () => {
    const observations = weekOf(WEEK_STARTS[0], [
      { day: 'mon', status: 'done' },
      { day: 'tue', status: 'moved' },
      { day: 'wed', status: 'missed' },
      { day: 'thu', status: 'unknown' },
    ])
    expect(completionRate(observations)).toBe(0.67)
  })

  it('is null rather than zero when nothing is resolved', () => {
    const untracked = weekOf(WEEK_STARTS[0], [{ day: 'mon', status: 'unknown' }])
    expect(completionRate(untracked)).toBeNull()
  })
})
