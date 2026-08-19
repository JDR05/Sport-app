// The safety limits have to hold for every profile, not just for the ones the
// engine was written against. See ADR-008.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { intakeFloor } from '@/lib/engine/energy'
import { maxWeeklyLossKg, longestTrainingRun } from '@/lib/engine/safety'
import {
  MAX_CONSECUTIVE_TRAINING_DAYS,
  MAX_DEFICIT_SHARE,
  MIN_REST_DAYS,
  FALLBACK,
} from '@/lib/engine/constants'
import { ALL_PROFILES, incompleteProfile } from './fixtures/profiles'

const CASES = [...ALL_PROFILES, { name: 'Unvollständiges Profil', input: incompleteProfile }]

describe.each(CASES)('$name', ({ input }) => {
  const plan = generatePlan(input)
  const weight = input.metrics.find((m) => m.metricKey === 'weight_kg')!

  it('never plans an intake below the floor', () => {
    expect(plan.strategy.targetIntakeKcal).toBeGreaterThanOrEqual(intakeFloor(input.profile))
  })

  it('never exceeds the deficit share of the daily need', () => {
    expect(plan.strategy.deficitKcal).toBeLessThanOrEqual(
      plan.strategy.dailyNeedKcal * MAX_DEFICIT_SHARE + 1,
    )
  })

  it('never exceeds the weekly rate cap', () => {
    expect(plan.strategy.ratePerWeekKg).toBeLessThanOrEqual(maxWeeklyLossKg(weight.startValue) + 0.05)
  })

  it('keeps the required number of rest days', () => {
    const experience = input.profile.sport.experience ?? FALLBACK.experience
    expect(plan.strategy.restWeekdays.length).toBeGreaterThanOrEqual(MIN_REST_DAYS[experience])
  })

  it('never schedules too many training days in a row', () => {
    expect(longestTrainingRun(plan.strategy.trainingWeekdays)).toBeLessThanOrEqual(
      MAX_CONSECUTIVE_TRAINING_DAYS,
    )
  })

  it('respects every hard constraint', () => {
    for (const c of input.constraints) {
      if (!c.hard) continue
      if (c.value.type === 'no_training_on') {
        for (const day of c.value.weekdays) {
          expect(plan.strategy.trainingWeekdays).not.toContain(day)
        }
      }
      if (c.value.type === 'max_session_minutes') {
        expect(plan.strategy.sessionMinutes).toBeLessThanOrEqual(c.value.minutes)
      }
    }
  })

  it('gives every action a rationale that cites a user input', () => {
    expect(plan.items.length).toBeGreaterThan(0)
    for (const item of plan.items) {
      expect(item.rationale.text.trim()).not.toBe('')
      expect(item.rationale.basedOn.length).toBeGreaterThan(0)
    }
  })

  it('plans only the three MVP domains', () => {
    for (const item of plan.items) {
      expect(['training', 'nutrition', 'movement']).toContain(item.domain)
    }
  })

  it('contains no compensatory logic', () => {
    for (const item of plan.items) {
      expect(item.details).not.toHaveProperty('compensatesFor')
    }
  })

  it('never schedules a session longer than the free slot it sits in', () => {
    for (const item of plan.items) {
      if (item.domain !== 'training') continue
      const available = item.details.availableMinutes as number
      expect(item.plannedDurationMin!).toBeLessThanOrEqual(available)
    }
  })
})
