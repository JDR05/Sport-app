// Onboarding abandonment must not block a plan, whatever the goal.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { intakeFloor } from '@/lib/engine/energy'
import { INTAKE_FLOOR_KCAL } from '@/lib/engine/constants'
import { GOALS, PROFILES, incompleteInput, makeInput } from './fixtures/profiles'

describe('incomplete profile', () => {
  const plan = generatePlan(incompleteInput)

  it('still produces a usable plan', () => {
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.strategy.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('records an assumption for every field it had to fill in', () => {
    const fields = plan.assumptions.map((a) => a.field)
    expect(fields).toContain('profile.birthYear')
    expect(fields).toContain('profile.heightCm')
    expect(fields).toContain('profile.weightKg')
    expect(fields).toContain('profile.sexAtBirth')
    expect(fields).toContain('profile.sport.experience')
  })

  it('explains every assumption in language the user can read', () => {
    for (const a of plan.assumptions) {
      expect(a.assumed.trim()).not.toBe('')
      expect(a.reason.trim().length).toBeGreaterThan(20)
    }
  })

  it('resolves an unknown sex towards the higher calorie floor', () => {
    expect(intakeFloor(incompleteInput.profile)).toBe(INTAKE_FLOOR_KCAL.male)
  })
})

describe('every archetype survives a sparse profile', () => {
  it.each(GOALS)('$name still yields a plan', (goal) => {
    const plan = generatePlan({ ...incompleteInput, goal: goal.goal, metrics: goal.metrics(incompleteInput.profile) })
    expect(plan.items.length).toBeGreaterThan(0)
  })
})

describe('complete profile', () => {
  it('records no assumptions when nothing was missing', () => {
    const plan = generatePlan(makeInput(PROFILES[3], GOALS[0]))
    expect(plan.assumptions).toHaveLength(0)
  })
})

describe('determinism', () => {
  it('produces byte identical plans for the same input', () => {
    const input = makeInput(PROFILES[0], GOALS[0])
    expect(JSON.stringify(generatePlan(input))).toBe(JSON.stringify(generatePlan(input)))
  })
})
