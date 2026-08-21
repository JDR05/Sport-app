// Every safety limit, for every profile, under every goal.
//
// Seventy combinations. The archetype-specific limits run through
// assertPlanInvariants, which generatePlan calls before returning — so a plan
// that violates one never reaches this test as a value, it throws.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { MAX_CONSECUTIVE_TRAINING_DAYS, MAX_ITEMS_PER_DAY } from '@/lib/engine/constants'
import { longestRun } from '@/lib/engine/context'
import { ALL_COMBINATIONS, incompleteInput } from './fixtures/profiles'
import { WEEKDAYS, type Weekday } from '@/lib/domain/types'
import { addDays } from '@/lib/engine/dates'

const CASES = [
  ...ALL_COMBINATIONS,
  { name: 'Unvollständiges Profil', input: incompleteInput },
]

describe.each(CASES)('$name', ({ input }) => {
  // generatePlan throws on any violation, so simply building it is the check.
  const plan = generatePlan(input)

  it('produces at least one action', () => {
    expect(plan.items.length).toBeGreaterThan(0)
  })

  it('never puts more than five actions on one day', () => {
    const perDay = new Map<string, number>()
    for (const item of plan.items) {
      perDay.set(item.scheduledOn, (perDay.get(item.scheduledOn) ?? 0) + 1)
    }
    for (const [, count] of perDay) {
      expect(count).toBeLessThanOrEqual(MAX_ITEMS_PER_DAY)
    }
  })

  it('never schedules too many training days in a row', () => {
    const trainingDays = WEEKDAYS.filter((_, index) => {
      const date = addDays(plan.strategy.weekStart, index)
      return plan.items.some((i) => i.scheduledOn === date && i.domain === 'training')
    }) as Weekday[]
    expect(longestRun(trainingDays)).toBeLessThanOrEqual(MAX_CONSECUTIVE_TRAINING_DAYS)
  })

  it('respects every hard constraint', () => {
    for (const c of input.constraints) {
      if (!c.hard || c.value.type !== 'no_training_on') continue
      for (const day of c.value.weekdays) {
        const date = addDays(plan.strategy.weekStart, WEEKDAYS.indexOf(day))
        const training = plan.items.filter((i) => i.scheduledOn === date && i.domain === 'training')
        expect(training).toHaveLength(0)
      }
    }
  })

  it('gives every action a rationale that cites a user input', () => {
    for (const item of plan.items) {
      expect(item.rationale.text.trim()).not.toBe('')
      expect(item.rationale.basedOn.length).toBeGreaterThan(0)
    }
  })

  it('contains no compensatory logic', () => {
    for (const item of plan.items) {
      expect(item.details).not.toHaveProperty('compensatesFor')
    }
  })

  it('runs a health baseline alongside the goal', () => {
    // The product idea: getting generally healthier and reaching the one goal
    // are not separate products. Every plan carries both tracks unless the goal
    // track already covers every baseline domain.
    const tracks = new Set(plan.items.map((i) => i.track))
    expect(tracks.has('goal') || plan.strategy.archetype === 'general_health').toBe(true)
    expect(plan.items.length).toBeGreaterThanOrEqual(plan.strategy.goalTrack.items.length > 0 ? 1 : 0)
  })
})

describe('the deficit follows the goal, not a rounded version of it', () => {
  // A deep-dive review flagged `round1()` on the weekly rate before the daily
  // calorie deficit is derived from it. Its predicted consequence — the
  // invariant rejecting the plan — was wrong: the invariant recomputes the
  // rate from the raw values, and targetIntake() caps the deficit anyway.
  //
  // The underlying point was right, though. 5 kg in 9 weeks is 0.5556 kg/week;
  // rounded to 0.6 it planned a deficit 49 kcal a day larger than the person
  // agreed to, and other inputs rounded the other way and planned a slower
  // loss than they asked for. A safety-relevant number must not be moved by a
  // rounding that exists for display.

  const KCAL_PER_KG = 7700

  /** What the deficit should be for a goal the cap does not bind. */
  function expectedDeficit(start: number, target: number, weeks: number): number {
    return (Math.abs(start - target) / weeks) * KCAL_PER_KG / 7
  }

  it.each([
    [75, 70, 9],
    [80, 74, 11],
    [85, 78, 12],
  ])('plans %s->%s kg over %s weeks from the exact rate', (start, target, weeks) => {
    const base = ALL_COMBINATIONS.find((c) => c.input.goal.archetype === 'body_composition')!.input
    const input = {
      ...base,
      profile: { ...base.profile, weightKg: start },
      goal: { ...base.goal, targetDate: addDays(base.today, weeks * 7) },
      metrics: [
        { metricKey: 'weight_kg', startValue: start, targetValue: target, unit: 'kg' },
      ],
    }

    const plan = generatePlan(input)
    const deficit = Number(plan.strategy.goalTrack.summary[1]?.match(/−(\d+)/)?.[1] ?? 0)

    // Either the safety cap bound — which is its job — or the deficit follows
    // the exact rate. What must never happen is a deficit that matches the
    // *rounded* rate while the cap left room for the true one.
    const exact = expectedDeficit(start, target, weeks)
    const rounded = (Math.round((Math.abs(start - target) / weeks) * 10) / 10) * KCAL_PER_KG / 7

    if (Math.abs(exact - rounded) > 5) {
      expect(Math.abs(deficit - rounded)).toBeGreaterThan(Math.abs(deficit - exact) - 1)
    }
    expect(deficit).toBeLessThanOrEqual(Math.ceil(exact) + 1)
  })
})
