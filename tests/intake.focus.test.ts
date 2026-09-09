// The intake may only stop asking what the plan never reads.
//
// The intake asked everyone the same twenty-one profile questions. A sleep goal
// was asked how long the person has to cook and how many meals a day they eat;
// nothing that runs for a sleep goal reads either. Shortening that is obviously
// right and just as obviously dangerous: drop one field an archetype does read
// and the plan quietly gets worse for one kind of goal, on a screen nobody
// looks at twice.
//
// So the shortening is not trusted, it is measured. For every archetype and
// every fixture person, a plan built from the shortened intake is compared
// against a plan built from the full one — the whole plan, not a summary. They
// have to be identical. Anything the intake stops asking that changes a plan
// shows up here as a diff.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { planSignature } from '@/lib/engine/signature'
import {
  areaIsAsked, AREA_FIELDS, assertCovers, fieldsFor, INTAKE_AREAS, skippedAreas, widen,
  type IntakeField,
} from '@/lib/domain/intakeFocus'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import { GOAL_ARCHETYPES, type GoalArchetype, type PlanInput } from '@/lib/domain/types'

/** The same person, with everything the shortened intake never asked blanked. */
function asIntakeWouldStore(input: PlanInput, archetype: GoalArchetype): PlanInput {
  const asked = fieldsFor(archetype)
  const blank = <T,>(field: IntakeField, value: T): T | null => (asked.has(field) ? value : null)
  const p = input.profile

  return {
    ...input,
    profile: {
      ...p,
      birthYear: blank('birthYear', p.birthYear),
      heightCm: blank('heightCm', p.heightCm),
      weightKg: blank('weightKg', p.weightKg),
      sexAtBirth: blank('sexAtBirth', p.sexAtBirth),
      sport: {
        ...p.sport,
        preferredActivities: asked.has('preferredActivities') ? p.sport.preferredActivities : [],
        equipment: asked.has('equipment') ? p.sport.equipment : ['none'],
        experience: blank('experience', p.sport.experience),
        sessionsPerWeekTarget: blank('sessionsPerWeekTarget', p.sport.sessionsPerWeekTarget),
        preferredSessionMinutes: blank('preferredSessionMinutes', p.sport.preferredSessionMinutes),
      },
      nutrition: {
        ...p.nutrition,
        cooksAtHome: blank('cooksAtHome', p.nutrition.cooksAtHome),
        timeForCookingMin: blank('timeForCookingMin', p.nutrition.timeForCookingMin),
        eatsOutPerWeek: blank('eatsOutPerWeek', p.nutrition.eatsOutPerWeek),
        dietaryPattern: blank('dietaryPattern', p.nutrition.dietaryPattern),
        mealsPerDay: blank('mealsPerDay', p.nutrition.mealsPerDay),
        vegetablePortionsPerDay: blank('vegetablePortionsPerDay', p.nutrition.vegetablePortionsPerDay),
        sugaryDrinksPerDay: blank('sugaryDrinksPerDay', p.nutrition.sugaryDrinksPerDay),
      },
      sleep: {
        ...p.sleep,
        usualBedtime: blank('usualBedtime', p.sleep.usualBedtime),
        usualWakeTime: blank('usualWakeTime', p.sleep.usualWakeTime),
        quality: blank('sleepQuality', p.sleep.quality),
        wakesAtNight: blank('wakesAtNight', p.sleep.wakesAtNight),
        screenBeforeBed: blank('screenBeforeBed', p.sleep.screenBeforeBed),
      },
      mind: {
        ...p.mind,
        screenTimeHoursPerDay: blank('screenTimeHoursPerDay', p.mind.screenTimeHoursPerDay),
        focusStruggle: blank('focusStruggle', p.mind.focusStruggle),
        existingRoutines: asked.has('existingRoutines') ? p.mind.existingRoutines : [],
      },
    },
  }
}

describe('the shortened intake produces the same plan', () => {
  for (const goal of GOALS) {
    for (let i = 0; i < PROFILES.length; i++) {
      it(`${goal.archetype}, profile ${i}`, () => {
        const full = makeInput(PROFILES[i], goal)
        const short = asIntakeWouldStore(full, goal.archetype)

        const a = generatePlan(full)
        const b = generatePlan(short)

        // The signature first, because a difference there is a difference the
        // person would feel; then the items, because a signature is a summary.
        expect(planSignature(b)).toEqual(planSignature(a))
        expect(b.items).toEqual(a.items)
      })
    }
  }
})

describe('the question set is derived, not decided', () => {
  it('asks for everything the plan reads, for every archetype', () => {
    for (const archetype of GOAL_ARCHETYPES) {
      expect(() => assertCovers(archetype, fieldsFor(archetype))).not.toThrow()
    }
  })

  it('refuses a set that drops a field the plan reads', () => {
    const asked = fieldsFor('sleep_recovery')
    asked.delete('usualBedtime')
    expect(() => assertCovers('sleep_recovery', asked)).toThrow(/usualBedtime/)
  })

  it('actually shortens the intake for every archetype', () => {
    const everything = new Set(Object.values(AREA_FIELDS).flat())
    for (const archetype of GOAL_ARCHETYPES) {
      expect(fieldsFor(archetype).size).toBeLessThan(everything.size)
    }
  })

  it('asks nothing the app cannot use', () => {
    // The union across all archetypes has to be the whole field list — a field
    // no archetype asks for is a question the intake would never show, and a
    // field in no area is a question nothing renders.
    const union = new Set(GOAL_ARCHETYPES.flatMap((a) => [...fieldsFor(a)]))
    const rendered = new Set(Object.values(AREA_FIELDS).flat())
    expect([...union].filter((f) => !rendered.has(f))).toEqual([])
  })
})

describe('the model may widen the intake, never narrow it', () => {
  it('adds a field it thinks matters', () => {
    const asked = widen('strength', ['sleepQuality', 'existingRoutines'])
    expect(asked.has('existingRoutines')).toBe(true)
  })

  it('keeps everything the plan reads even when told otherwise', () => {
    const asked = widen('sleep_recovery', [])
    expect(asked.has('usualBedtime')).toBe(true)
    expect(asked.has('wakesAtNight')).toBe(true)
  })

  it('ignores a field it invented', () => {
    const asked = widen('strength', ['bloodType' as IntakeField])
    expect(asked.has('bloodType' as IntakeField)).toBe(false)
  })
})

describe('what each goal is spared', () => {
  it('never skips a step it still asks something in', () => {
    for (const archetype of GOAL_ARCHETYPES) {
      const asked = fieldsFor(archetype)
      for (const area of skippedAreas(archetype)) {
        expect(areaIsAsked(area, asked)).toBe(false)
      }
    }
  })

  it('skips at least one whole step for most goals', () => {
    const spared = GOAL_ARCHETYPES.filter((a) => skippedAreas(a).length > 0)
    expect(spared.length).toBeGreaterThanOrEqual(4)
  })

  it('never skips every step', () => {
    for (const archetype of GOAL_ARCHETYPES) {
      expect(skippedAreas(archetype).length).toBeLessThan(INTAKE_AREAS.length)
    }
  })
})
