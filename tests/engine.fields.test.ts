// Field efficacy, now measured per archetype.
//
// Before the course correction a field had to change the plan for the one goal
// type that existed. That was too narrow: wake time is worthless for a weight
// goal and central to a sleep goal. A field is justified when it changes the
// plan for AT LEAST ONE archetype — and a field that changes nothing anywhere
// still has no business in the onboarding. See ADR-024.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { GOALS, PROFILES, makeInput } from './fixtures/profiles'
import type { PlanInput } from '@/lib/domain/types'

const base = PROFILES[0]

/**
 * The whole plan, not just its signature: a field that only changes the wording
 * of an action is still doing real work, because the user reads that wording.
 */
function fingerprint(input: PlanInput): string {
  const plan = generatePlan(input)
  return JSON.stringify({
    strategy: plan.strategy,
    items: plan.items.map((i) => ({
      on: i.scheduledOn, domain: i.domain, track: i.track, title: i.title,
      duration: i.plannedDurationMin, rationale: i.rationale.text, details: i.details,
    })),
  })
}

type FieldCase = { field: string; vary: (i: PlanInput) => PlanInput }

const p = (i: PlanInput, over: Partial<PlanInput['profile']>): PlanInput => ({
  ...i, profile: { ...i.profile, ...over },
})

const FIELDS: FieldCase[] = [
  { field: 'profile.birthYear', vary: (i) => p(i, { birthYear: 1965 }) },
  { field: 'profile.heightCm', vary: (i) => p(i, { heightCm: 190 }) },
  { field: 'profile.weightKg', vary: (i) => p(i, { weightKg: 110 }) },
  { field: 'profile.sexAtBirth', vary: (i) => p(i, { sexAtBirth: 'male' }) },

  { field: 'profile.sport.preferredActivities', vary: (i) => p(i, { sport: { ...i.profile.sport, preferredActivities: ['swimming'] } }) },
  { field: 'profile.sport.dislikedActivities', vary: (i) => p(i, { sport: { ...i.profile.sport, dislikedActivities: ['gym'] } }) },
  { field: 'profile.sport.sessionsPerWeekTarget', vary: (i) => p(i, { sport: { ...i.profile.sport, sessionsPerWeekTarget: 1 } }) },
  { field: 'profile.sport.preferredSessionMinutes', vary: (i) => p(i, { sport: { ...i.profile.sport, preferredSessionMinutes: 25 } }) },
  { field: 'profile.sport.equipment', vary: (i) => p(i, { sport: { ...i.profile.sport, equipment: ['none'] } }) },
  { field: 'profile.sport.experience', vary: (i) => p(i, { sport: { ...i.profile.sport, experience: 'advanced' } }) },

  { field: 'profile.nutrition.cooksAtHome', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, cooksAtHome: 'often' } }) },
  { field: 'profile.nutrition.timeForCookingMin', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, timeForCookingMin: 60 } }) },
  { field: 'profile.nutrition.eatsOutPerWeek', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, eatsOutPerWeek: 6 } }) },
  { field: 'profile.nutrition.dietaryPattern', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, dietaryPattern: 'vegan' } }) },
  { field: 'profile.nutrition.mealsPerDay', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, mealsPerDay: 5 } }) },
  { field: 'profile.nutrition.vegetablePortionsPerDay', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, vegetablePortionsPerDay: 0 } }) },
  { field: 'profile.nutrition.sugaryDrinksPerDay', vary: (i) => p(i, { nutrition: { ...i.profile.nutrition, sugaryDrinksPerDay: 5 } }) },

  { field: 'profile.sleep.usualBedtime', vary: (i) => p(i, { sleep: { ...i.profile.sleep, usualBedtime: '21:30' } }) },
  { field: 'profile.sleep.usualWakeTime', vary: (i) => p(i, { sleep: { ...i.profile.sleep, usualWakeTime: '05:30' } }) },
  { field: 'profile.sleep.quality', vary: (i) => p(i, { sleep: { ...i.profile.sleep, quality: 'poor' } }) },
  { field: 'profile.sleep.wakesAtNight', vary: (i) => p(i, { sleep: { ...i.profile.sleep, wakesAtNight: true } }) },
  { field: 'profile.sleep.screenBeforeBed', vary: (i) => p(i, { sleep: { ...i.profile.sleep, screenBeforeBed: false } }) },

  { field: 'profile.mind.screenTimeHoursPerDay', vary: (i) => p(i, { mind: { ...i.profile.mind, screenTimeHoursPerDay: 9 } }) },
  { field: 'profile.mind.focusStruggle', vary: (i) => p(i, { mind: { ...i.profile.mind, focusStruggle: 'high' } }) },
  { field: 'profile.mind.existingRoutines', vary: (i) => p(i, { mind: { ...i.profile.mind, existingRoutines: ['Kaffee um 7'] } }) },

  { field: 'schedule.workPattern', vary: (i) => ({ ...i, schedule: { ...i.schedule, workPattern: 'shift' } }) },
  {
    field: 'schedule.freeSlots',
    vary: (i) => ({
      ...i,
      schedule: {
        ...i.schedule,
        freeSlots: [
          { weekday: 'mon', start: '06:00', minutes: 60 },
          { weekday: 'wed', start: '06:00', minutes: 60 },
        ],
      },
    }),
  },
  { field: 'goal.targetDate', vary: (i) => ({ ...i, goal: { ...i.goal, targetDate: '2026-09-30' } }) },
  { field: 'goal.rawText', vary: (i) => ({ ...i, goal: { ...i.goal, rawText: 'Etwas völlig anderes formuliert' } }) },
  {
    field: 'constraints.no_training_on',
    vary: (i) => ({
      ...i,
      constraints: [{ kind: 'time', hard: true, value: { type: 'no_training_on', weekdays: ['tue', 'thu'] } }],
    }),
  },
]

describe('onboarding fields', () => {
  it.each(FIELDS)('$field changes the plan for at least one archetype', ({ vary }) => {
    const affected = GOALS.filter((goal) => {
      const input = makeInput(base, goal)
      return fingerprint(vary(input)) !== fingerprint(input)
    }).map((g) => g.archetype)

    expect(affected.length, `affects: ${affected.join(', ') || 'nothing'}`).toBeGreaterThan(0)
  })
})

describe('coverage', () => {
  it('every archetype is affected by at least three different fields', () => {
    // A goal type that almost nothing influences would be a goal type that only
    // pretends to be personalised.
    const counts = new Map(GOALS.map((g) => [g.archetype, 0]))
    for (const { vary } of FIELDS) {
      for (const goal of GOALS) {
        const input = makeInput(base, goal)
        if (fingerprint(vary(input)) !== fingerprint(input)) {
          counts.set(goal.archetype, (counts.get(goal.archetype) ?? 0) + 1)
        }
      }
    }
    for (const [archetype, count] of counts) {
      expect(count, `${archetype} is influenced by only ${count} field(s)`).toBeGreaterThanOrEqual(3)
    }
  })
})
