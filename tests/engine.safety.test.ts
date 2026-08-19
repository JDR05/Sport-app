import { describe, expect, it } from 'vitest'
import {
  assertPlanInvariants,
  clampGoal,
  longestTrainingRun,
  maxWeeklyLossKg,
  PlanInvariantError,
} from '@/lib/engine/safety'
import { generatePlan } from '@/lib/engine'
import { MAX_WEEKLY_LOSS_KG, MAX_WEEKLY_LOSS_SHARE } from '@/lib/engine/constants'
import { erikImpatient, lenaStudent, TODAY } from './fixtures/profiles'
import type { PlanInput } from '@/lib/domain/types'

describe('maxWeeklyLossKg', () => {
  it('applies the relative cap for normal body weights', () => {
    expect(maxWeeklyLossKg(80)).toBeCloseTo(80 * MAX_WEEKLY_LOSS_SHARE, 5)
  })

  it('applies the absolute cap for very high body weights', () => {
    expect(maxWeeklyLossKg(200)).toBe(MAX_WEEKLY_LOSS_KG)
  })
})

describe('clampGoal', () => {
  it('moves the date rather than the rate when the wish is too fast', () => {
    const result = clampGoal({
      goal: erikImpatient.goal,
      metrics: erikImpatient.metrics,
      profile: erikImpatient.profile,
      today: TODAY,
    })
    expect(result.adjusted).toBe(true)
    expect(result.targetDate > (erikImpatient.goal.targetDate ?? '')).toBe(true)
    expect(result.ratePerWeekKg).toBeLessThanOrEqual(maxWeeklyLossKg(91) + 0.05)
  })

  it('phrases the adjustment as a commitment with a date, never as a refusal', () => {
    const result = clampGoal({
      goal: erikImpatient.goal,
      metrics: erikImpatient.metrics,
      profile: erikImpatient.profile,
      today: TODAY,
    })
    expect(result.reason).toMatch(/kg bis zum \d{1,2}\. \w+ \d{4}/)
    expect(result.reason).not.toMatch(/nicht möglich|unrealistisch|geht nicht/i)
  })

  it('leaves a realistic goal alone', () => {
    const result = clampGoal({
      goal: lenaStudent.goal,
      metrics: lenaStudent.metrics,
      profile: lenaStudent.profile,
      today: TODAY,
    })
    expect(result.adjusted).toBe(false)
    expect(result.targetDate).toBe(lenaStudent.goal.targetDate)
  })

  it('derives a date consistent with the rate when no date was given', () => {
    const openEnded: PlanInput = { ...lenaStudent, goal: { ...lenaStudent.goal, targetDate: null } }
    const result = clampGoal({
      goal: openEnded.goal,
      metrics: openEnded.metrics,
      profile: openEnded.profile,
      today: TODAY,
    })
    const weeks = (Date.parse(result.targetDate) - Date.parse(TODAY)) / (7 * 86_400_000)
    // Date and rate have to describe the same plan.
    expect(result.ratePerWeekKg * weeks).toBeCloseTo(result.totalLossKg, 0)
  })
})

describe('longestTrainingRun', () => {
  it('counts across the week boundary, because weeks repeat', () => {
    expect(longestTrainingRun(['sat', 'sun', 'mon'])).toBe(3)
    expect(longestTrainingRun(['mon', 'wed', 'fri'])).toBe(1)
    expect(longestTrainingRun(['mon', 'tue', 'wed', 'thu'])).toBe(4)
  })

  it('saturates at a full week', () => {
    expect(longestTrainingRun(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).toBe(7)
  })
})

describe('assertPlanInvariants', () => {
  it('rejects a plan whose intake was tampered with below the floor', () => {
    const plan = generatePlan(lenaStudent)
    const broken = { ...plan, strategy: { ...plan.strategy, targetIntakeKcal: 900 } }
    expect(() => assertPlanInvariants(broken, lenaStudent)).toThrow(PlanInvariantError)
  })

  it('rejects compensatory logic in an item', () => {
    const plan = generatePlan(lenaStudent)
    const broken = {
      ...plan,
      items: plan.items.map((i, idx) =>
        idx === 0 ? { ...i, details: { ...i.details, compensatesFor: '2026-08-18' } } : i,
      ),
    }
    expect(() => assertPlanInvariants(broken, lenaStudent)).toThrow(/compensatory/)
  })

  it('rejects an item without a rationale', () => {
    const plan = generatePlan(lenaStudent)
    const broken = {
      ...plan,
      items: plan.items.map((i, idx) =>
        idx === 0 ? { ...i, rationale: { text: '', basedOn: [] } } : i,
      ),
    }
    expect(() => assertPlanInvariants(broken, lenaStudent)).toThrow(/no rationale/)
  })
})
