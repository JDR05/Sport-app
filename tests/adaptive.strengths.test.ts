// The magic moment, and the reason it has a higher bar than everything else.
//
// Every other part of this layer looks for what is going wrong. That is
// necessary and it is also how a health app turns into a second job: six weeks
// in, the only thing it has ever said about you is where you fall short.
//
// So this is the same machinery pointed the other way — and it has to be
// harder to trigger, not easier. "Samstags läuft es bei dir gut" said about a
// coin flip is flattery, and flattery from a measuring instrument costs it
// everything it has.

import { describe, expect, it } from 'vitest'
import { analyze, detectStrengths } from '@/lib/adaptive'
import {
  MIN_CONTRAST, MIN_DISTINCT_WEEKS, MIN_RESOLVED_INSTANCES, MIN_STRENGTH_RATE,
} from '@/lib/adaptive/constants'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import { repeat, weekOf, WEEK_STARTS } from './fixtures/observations'

const aylin = makeInput(PROFILES[4], GOALS[1])

/** Saturdays work, Wednesdays do not. Four weeks of it. */
const SATURDAY_WORKS = repeat([
  { day: 'sat', status: 'done' },
  { day: 'wed', status: 'missed' },
  { day: 'mon', status: 'missed' },
])

describe('a strength the data actually supports', () => {
  it('finds the day that reliably works', () => {
    const found = detectStrengths(SATURDAY_WORKS)
    const saturday = found.find((s) => s.dimension === 'weekday' && s.bucket === 'sat')

    expect(saturday).toBeDefined()
    expect(saturday?.rate).toBe(1)
    expect(saturday?.comparisonRate).toBe(0)
    expect(saturday?.distinctWeeks).toBe(WEEK_STARTS.length)
  })

  it('carries the actions it was measured on', () => {
    // Principle four: a statement whose underlying data cannot be shown must
    // not exist. Here the evidence is the days that went well.
    const [best] = detectStrengths(SATURDAY_WORKS)
    expect(best.evidence.length).toBe(best.done)
    expect(best.done).toBeGreaterThanOrEqual(MIN_RESOLVED_INSTANCES)
  })

  it('puts the clearest one first', () => {
    const found = detectStrengths(SATURDAY_WORKS)
    const margins = found.map((s) => s.rate - s.comparisonRate)
    expect([...margins].sort((a, b) => b - a)).toEqual(margins)
  })
})

describe('what it refuses to call a strength', () => {
  it('stays silent below the completion bar, however wide the margin', () => {
    // Three Saturdays out of four, against a week that barely moves: a huge
    // contrast and still not a strength. Detection would have reported the
    // mirror image of this at once — that asymmetry is the point.
    const nearly = [
      ...weekOf(WEEK_STARTS[0], [
        { day: 'sat', status: 'done' },
        { day: 'wed', status: 'missed' },
        { day: 'mon', status: 'missed' },
      ]),
      ...weekOf(WEEK_STARTS[1], [
        { day: 'sat', status: 'done' },
        { day: 'wed', status: 'missed' },
        { day: 'mon', status: 'done' },
      ]),
      ...weekOf(WEEK_STARTS[2], [
        { day: 'sat', status: 'done' },
        { day: 'wed', status: 'missed' },
        { day: 'mon', status: 'missed' },
      ]),
      ...weekOf(WEEK_STARTS[3], [
        { day: 'sat', status: 'missed' },
        { day: 'wed', status: 'missed' },
        { day: 'mon', status: 'missed' },
      ]),
    ]

    const saturday = detectStrengths(nearly).find((s) => s.bucket === 'sat')
    expect(saturday).toBeUndefined()
    expect(MIN_STRENGTH_RATE).toBeGreaterThan(0.75)
  })

  it('stays silent when everything works', () => {
    // Someone who completes their whole plan has no strength on any axis.
    // Telling them Saturdays are special would be inventing a distinction.
    const everything = repeat([
      { day: 'mon', status: 'done' },
      { day: 'wed', status: 'done' },
      { day: 'sat', status: 'done' },
    ])
    expect(detectStrengths(everything)).toEqual([])
  })

  it('stays silent inside a single good week', () => {
    // Four good days in one week are one good week.
    const oneWeek = weekOf('2026-08-03', [
      { day: 'mon', status: 'done' },
      { day: 'tue', status: 'done' },
      { day: 'wed', status: 'done' },
      { day: 'thu', status: 'done' },
      { day: 'fri', status: 'missed' },
      { day: 'sat', status: 'missed' },
    ])
    for (const s of detectStrengths(oneWeek)) {
      expect(s.distinctWeeks).toBeGreaterThanOrEqual(MIN_DISTINCT_WEEKS)
    }
  })

  it('stays silent when the margin is thin', () => {
    const thin = repeat([
      { day: 'sat', status: 'done' },
      { day: 'sun', status: 'done' },
      { day: 'mon', status: 'done' },
      { day: 'wed', status: 'missed' },
    ])
    for (const s of detectStrengths(thin)) {
      expect(s.rate - s.comparisonRate).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it('never counts an unrated action as a success', () => {
    // The whole reason `unknown` exists. Tracking fatigue must not be able to
    // manufacture a compliment any more than it can manufacture a problem.
    const untouched = repeat([
      { day: 'sat', status: 'unknown' },
      { day: 'wed', status: 'missed' },
    ])
    expect(detectStrengths(untouched)).toEqual([])
  })

  it('says nothing at all in week one', () => {
    const first = weekOf('2026-08-03', [{ day: 'mon', status: 'done' }])
    expect(detectStrengths(first)).toEqual([])
  })
})

describe('where it shows up', () => {
  it('reaches the screen as an insight of its own kind', () => {
    const analysis = analyze(aylin, SATURDAY_WORKS)
    const progress = analysis.insights.filter((i) => i.kind === 'progress')

    expect(analysis.strengths.length).toBeGreaterThan(0)
    expect(progress.length).toBe(1)
    expect(progress[0].evidence.length).toBeGreaterThan(0)
  })

  it('is said first, before anything that went wrong', () => {
    const analysis = analyze(aylin, SATURDAY_WORKS)
    expect(analysis.insights[0].kind).toBe('progress')
  })

  it('names the day rather than printing its key', () => {
    const [first] = analyze(aylin, SATURDAY_WORKS).insights
    expect(first.statement).toContain('Samstag')
    expect(first.statement).not.toContain('sat')
  })

  it('never praises the person, only names when the plan works', () => {
    // A measuring instrument may not say "du bist toll". It may say what it
    // measured, and where.
    const [first] = analyze(aylin, SATURDAY_WORKS).insights
    expect(first.statement).not.toMatch(/stolz|super|toll|großartig|Disziplin/)
    expect(first.statement).toMatch(/\d+ von \d+/)
  })

  it('is still said when there is no pattern to report', () => {
    const goodOnly = repeat([
      { day: 'sat', status: 'done' },
      { day: 'wed', status: 'missed' },
    ])
    const analysis = analyze(aylin, goodOnly)
    if (analysis.deviations.length === 0) {
      expect(analysis.insights.every((i) => i.kind === 'progress')).toBe(true)
    }
    expect(analysis.insights.some((i) => i.kind === 'progress')).toBe(true)
  })
})
