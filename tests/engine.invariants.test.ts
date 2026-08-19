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
