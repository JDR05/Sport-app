// Onboarding abandonment must not block a plan.
//
// "Fehlende Daten sind kein Versagen" is a stated principle; here it becomes a
// test. A user who answers the bare minimum still gets something usable, and
// every gap the engine filled in is written down where the UI can show it.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { intakeFloor } from '@/lib/engine/energy'
import { INTAKE_FLOOR_KCAL } from '@/lib/engine/constants'
import { incompleteProfile, lenaStudent } from './fixtures/profiles'

describe('incomplete profile', () => {
  const plan = generatePlan(incompleteProfile)

  it('still produces a usable plan', () => {
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.strategy.trainingSessions).toBeGreaterThan(0)
    expect(plan.strategy.targetIntakeKcal).toBeGreaterThan(0)
  })

  it('records an assumption for every field it had to fill in', () => {
    const fields = plan.assumptions.map((a) => a.field)
    expect(fields).toContain('profile.birthYear')
    expect(fields).toContain('profile.heightCm')
    expect(fields).toContain('profile.sexAtBirth')
    expect(fields).toContain('profile.sport.experience')
    expect(fields).toContain('profile.nutrition.cooksAtHome')
    expect(fields).toContain('schedule.workPattern')
  })

  it('explains every assumption in language the user can read', () => {
    for (const a of plan.assumptions) {
      expect(a.assumed.trim()).not.toBe('')
      expect(a.reason.trim().length).toBeGreaterThan(20)
    }
  })

  it('resolves an unknown sex towards the higher calorie floor', () => {
    expect(intakeFloor(incompleteProfile.profile)).toBe(INTAKE_FLOOR_KCAL.male)
    expect(plan.strategy.targetIntakeKcal).toBeGreaterThanOrEqual(INTAKE_FLOOR_KCAL.male)
  })

  it('gives a beginner the more cautious rest requirement', () => {
    expect(plan.strategy.restWeekdays.length).toBeGreaterThanOrEqual(2)
  })

  it('still commits to a concrete date', () => {
    expect(plan.strategy.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(plan.rationale.some((r) => /kg bis zum/.test(r.text))).toBe(true)
  })
})

describe('complete profile', () => {
  it('records no assumptions when nothing was missing', () => {
    const plan = generatePlan(lenaStudent)
    expect(plan.assumptions).toHaveLength(0)
  })
})

describe('determinism', () => {
  it('produces byte identical plans for the same input', () => {
    const a = JSON.stringify(generatePlan(lenaStudent))
    const b = JSON.stringify(generatePlan(lenaStudent))
    expect(a).toBe(b)
  })
})
