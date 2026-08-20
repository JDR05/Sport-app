// Onboarding abandonment must not block a plan, whatever the goal.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { intakeFloor } from '@/lib/engine/energy'
import { INTAKE_FLOOR_KCAL } from '@/lib/engine/constants'
import { WEEKDAYS } from '@/lib/domain/types'
import { weekdayOf } from '@/lib/engine/dates'
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


describe('nobody named a free slot', () => {
  // The onboarding offers "Rest überspringen – die App nimmt vorsichtige
  // Annahmen" and this is what that produces. Two archetypes used to throw on
  // it, which put the person on a screen blaming a safety limit for what was
  // really "you gave me no time" — with no route back to the onboarding.
  //
  // The existing loop below missed it because `incompleteInput` carries two
  // free slots, so the empty case never ran.
  const noSlots = { ...incompleteInput, schedule: { workPattern: null, freeSlots: [], commitments: [] } }

  it('still produces a plan with goal actions, for every archetype', () => {
    for (const goal of GOALS) {
      const input = { ...noSlots, goal: goal.goal, metrics: goal.metrics(noSlots.profile) }
      const plan = generatePlan(input)
      expect(
        plan.items.filter((i) => i.track === 'goal').length,
        goal.archetype,
      ).toBeGreaterThan(0)
    }
  })

  it('says out loud that it assumed the days', () => {
    const plan = generatePlan(noSlots)
    const assumed = plan.assumptions.find((a) => a.field === 'schedule.freeSlots')
    expect(assumed).toBeDefined()
    expect(assumed?.reason).toContain('Keine freien Zeitfenster')
  })

  it('never assumes a day the user excluded', () => {
    // An assumption may fill a gap. It may not overrule an answer.
    const blocked = {
      ...noSlots,
      constraints: [
        {
          kind: 'time' as const,
          hard: true,
          value: { type: 'no_training_on' as const, weekdays: WEEKDAYS.filter((d) => d !== 'sun') },
        },
      ],
    }
    const plan = generatePlan(blocked)
    const trainingDays = plan.items
      .filter((i) => i.domain === 'training')
      .map((i) => weekdayOf(i.scheduledOn))
    for (const day of trainingDays) expect(day).toBe('sun')
  })
})
