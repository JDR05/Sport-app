// A standing rule is true every day, or it is not a rule.
//
// The calorie corridor, protein at every meal, a bedtime — these were planned
// as one-off items on a hardcoded weekday. Two things broke at once. The plan
// read as nonsense: "Eiweiß zu jeder Hauptmahlzeit" on a Wednesday and nowhere
// else. And the whole nutrition side of a weight goal was measured by a single
// tick a week, which is the behaviour metric the adaptive engine is allowed to
// draw permanent conclusions from.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { materialise } from '@/lib/db/item-mapping'
import { addDays } from '@/lib/engine/dates'
import { ALL_COMBINATIONS, GOALS, makeInput, PROFILES } from './fixtures/profiles'

/** The days of the materialised week, as counts. */
function perDay(input: Parameters<typeof generatePlan>[0]): number[] {
  const plan = generatePlan(input)
  const week = materialise(plan.items, plan.strategy.weekStart)
  return Array.from(
    { length: 7 },
    (_, day) =>
      week.filter((i) => i.scheduledOn === addDays(plan.strategy.weekStart, day)).length,
  )
}

describe('a week someone can actually open every day', () => {
  it('leaves no day of any plan empty', () => {
    // Before this, 19% of all days across the 70 combinations had nothing on
    // them at all, and 41% had exactly one action — against a brief that says
    // Today shows three to five.
    const emptyDays = ALL_COMBINATIONS.flatMap(({ name, input }) =>
      perDay(input)
        .map((count, day) => ({ name, day, count }))
        .filter((d) => d.count === 0),
    )
    expect(emptyDays).toEqual([])
  })

  it('keeps the great majority of days at two actions or more', () => {
    const counts = ALL_COMBINATIONS.flatMap(({ input }) => perDay(input))
    const thin = counts.filter((n) => n < 2).length
    expect(thin / counts.length).toBeLessThan(0.1)
  })
})

describe('what expansion does and does not touch', () => {
  const input = makeInput(PROFILES[0], GOALS[0])
  const plan = generatePlan(input)
  const week = materialise(plan.items, plan.strategy.weekStart)

  it('puts a standing rule on all seven days', () => {
    const daily = plan.items.filter((i) => i.cadence === 'daily')
    expect(daily.length).toBeGreaterThan(0)

    for (const rule of daily) {
      const days = week.filter((i) => i.title === rule.title)
      expect(days).toHaveLength(7)
      expect(new Set(days.map((d) => d.scheduledOn)).size).toBe(7)
    }
  })

  it('leaves an appointment on its own day', () => {
    // Meal prep and the weekly shop really are single events. Spreading them
    // would be the same mistake in the other direction.
    const shopping = week.filter((i) => i.title.includes('Einkauf'))
    expect(shopping).toHaveLength(1)

    const training = week.filter((i) => i.domain === 'training')
    expect(new Set(training.map((t) => t.scheduledOn)).size).toBe(training.length)
  })

  it('changes nothing when a plan has no standing rules', () => {
    const none = plan.items.filter((i) => i.cadence !== 'daily')
    expect(materialise(none, plan.strategy.weekStart)).toEqual(none)
  })

  it('leaves the count the engine decided untouched', () => {
    // The archetype invariants count rules, not days — a cap of three
    // nutrition additions must not be tripped by the same three appearing on
    // seven mornings. Expansion therefore has to happen after the engine, not
    // inside it.
    const rules = plan.items.length
    expect(rules).toBeLessThan(week.length)
    expect(plan.items.filter((i) => i.cadence === 'daily').length).toBeGreaterThan(0)
  })
})
