// Measurements were written on every entry, drawn on the Progress chart, and
// read by nothing that plans.
//
// So a plan was computed from the start value for ever. Someone four kilos into
// a five-kilo goal still got the deficit sized for the whole five. Someone who
// had arrived kept getting a deficit they no longer needed — which is not just
// wrong, it is the kind of wrong the body rules in CLAUDE.md exist to prevent.
// And no code path ever set `goal_status = 'reached'`, so a goal-execution app
// had no ending at all.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { currentOf } from '@/lib/engine/progress'
import { metricReached } from '@/lib/domain/types'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { GoalMetric, PlanInput } from '@/lib/domain/types'

const weight = makeInput(PROFILES[0], GOALS[0])

/** The same input, with a measurement recorded since. */
function measured(input: PlanInput, currentValue: number): PlanInput {
  return {
    ...input,
    metrics: input.metrics.map((m) => ({ ...m, currentValue })),
  }
}

const metric = (over: Partial<GoalMetric>): GoalMetric => ({
  metricKey: 'weight_kg',
  startValue: 80,
  targetValue: 75,
  currentValue: null,
  unit: 'kg',
  ...over,
})

describe('what the plan is computed from', () => {
  it('uses the start value while there is no measurement', () => {
    expect(currentOf(metric({}))).toBe(80)
  })

  it('uses the latest measurement once there is one', () => {
    expect(currentOf(metric({ currentValue: 76 }))).toBe(76)
  })

  it('has no answer for a goal with no metric', () => {
    expect(currentOf(undefined)).toBeNull()
  })

  it('changes the plan as the person actually moves', () => {
    // The whole point. A plan that does not move with the measurements is a
    // plan built from a number the person left behind weeks ago.
    const atStart = generatePlan(weight)
    const almostThere = generatePlan(measured(weight, (weight.metrics[0].targetValue ?? 0) + 0.5))

    expect(atStart.strategy.goalTrack.signature.intakeBucket).not.toBe(
      almostThere.strategy.goalTrack.signature.intakeBucket,
    )
  })

  it('stops planning a deficit once the target is met', () => {
    // The safety half. Continuing to plan a shortfall for someone who has
    // arrived keeps them in a restriction they no longer need.
    const target = weight.metrics[0].targetValue ?? 0
    const arrived = generatePlan(measured(weight, target))
    const start = generatePlan(weight)

    expect(Number(arrived.strategy.goalTrack.signature.intakeBucket)).toBeGreaterThan(
      Number(start.strategy.goalTrack.signature.intakeBucket),
    )
  })

  it('still produces a safe, complete plan at every point along the way', () => {
    const from = weight.metrics[0].startValue ?? 80
    const to = weight.metrics[0].targetValue ?? 75
    for (let v = from; v >= to - 2; v -= 0.5) {
      expect(() => generatePlan(measured(weight, v)), `bei ${v} kg`).not.toThrow()
      expect(generatePlan(measured(weight, v)).items.length).toBeGreaterThan(0)
    }
  })
})

describe('having arrived', () => {
  it('counts down for a goal that counts down', () => {
    expect(metricReached(metric({ currentValue: 75 }))).toBe(true)
    expect(metricReached(metric({ currentValue: 74 }))).toBe(true)
    expect(metricReached(metric({ currentValue: 76 }))).toBe(false)
  })

  it('counts up for a goal that counts up', () => {
    // Direction comes from the start, not from an assumption about the metric.
    // Endurance and strength count up; so does someone gaining weight.
    const up = metric({ startValue: 20, targetValue: 50, metricKey: 'distance_km' })
    expect(metricReached({ ...up, currentValue: 50 })).toBe(true)
    expect(metricReached({ ...up, currentValue: 49 })).toBe(false)
  })

  it('says nothing before the first measurement', () => {
    // No reading is not an arrival, and it is not a failure either.
    expect(metricReached(metric({ currentValue: null }))).toBe(false)
    expect(metricReached(undefined)).toBe(false)
  })

  it('says nothing when start and target are the same', () => {
    // No direction to travel in, so nothing to arrive at.
    expect(metricReached(metric({ startValue: 75, targetValue: 75, currentValue: 75 }))).toBe(false)
  })

  it('says nothing for a goal that has no numbers', () => {
    expect(metricReached(metric({ startValue: null, currentValue: 70 }))).toBe(false)
    expect(metricReached(metric({ targetValue: null, currentValue: 70 }))).toBe(false)
  })

  it('holds for every goal with a metric in the fixtures', () => {
    for (const goal of GOALS) {
      const input = makeInput(PROFILES[0], goal)
      const m = input.metrics[0]
      if (!m || m.startValue === null || m.targetValue === null) continue

      expect(metricReached(m), `${goal.name} vor der ersten Messung`).toBe(false)
      expect(metricReached({ ...m, currentValue: m.targetValue }), `${goal.name} am Ziel`).toBe(true)
    }
  })
})
