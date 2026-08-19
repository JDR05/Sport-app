// Field efficacy.
//
// The uncomfortable counterpart to the personalisation gate: every field the
// onboarding asks for in stage one has to demonstrably change the plan. A
// question whose answer changes nothing is a question that should not be asked,
// and "minimum input, maximum intelligence" is otherwise just a slogan.
//
// Fields that fail this test do not get an exemption. They either start being
// used by the engine or they move to stage two. See ADR-014.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { lenaStudent } from './fixtures/profiles'
import type { PlanInput } from '@/lib/domain/types'

/**
 * The whole plan, not just its signature: a field that only changes the wording
 * of an action is still doing real work, because the user reads that wording.
 * See critique K1.
 */
function planFingerprint(input: PlanInput): string {
  const plan = generatePlan(input)
  return JSON.stringify({
    strategy: plan.strategy,
    items: plan.items.map((i) => ({
      on: i.scheduledOn,
      domain: i.domain,
      title: i.title,
      duration: i.plannedDurationMin,
      rationale: i.rationale.text,
      details: i.details,
    })),
  })
}

const base = lenaStudent
const baseline = planFingerprint(base)

/** Every stage-one onboarding field, with a plausible alternative answer. */
const STAGE_1_FIELDS: Array<{ field: string; vary: (i: PlanInput) => PlanInput }> = [
  {
    field: 'metrics.weight_kg.startValue',
    vary: (i) => ({ ...i, metrics: [{ ...i.metrics[0], startValue: 95 }] }),
  },
  {
    field: 'metrics.weight_kg.targetValue',
    vary: (i) => ({ ...i, metrics: [{ ...i.metrics[0], targetValue: 62 }] }),
  },
  {
    field: 'goal.targetDate',
    vary: (i) => ({ ...i, goal: { ...i.goal, targetDate: '2026-10-05' } }),
  },
  {
    field: 'profile.birthYear',
    vary: (i) => ({ ...i, profile: { ...i.profile, birthYear: 1970 } }),
  },
  {
    field: 'profile.heightCm',
    vary: (i) => ({ ...i, profile: { ...i.profile, heightCm: 185 } }),
  },
  {
    field: 'profile.sexAtBirth',
    vary: (i) => ({ ...i, profile: { ...i.profile, sexAtBirth: 'male' } }),
  },
  {
    field: 'schedule.workPattern',
    vary: (i) => ({ ...i, schedule: { ...i.schedule, workPattern: 'office' } }),
  },
  {
    field: 'schedule.freeSlots',
    vary: (i) => ({
      ...i,
      schedule: {
        ...i.schedule,
        freeSlots: [
          { weekday: 'mon', start: '06:00', minutes: 60 },
          { weekday: 'wed', start: '06:00', minutes: 60 },
          { weekday: 'fri', start: '06:00', minutes: 60 },
        ],
      },
    }),
  },
  {
    field: 'profile.sport.sessionsPerWeekTarget',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, sport: { ...i.profile.sport, sessionsPerWeekTarget: 1 } },
    }),
  },
  {
    field: 'profile.sport.preferredSessionMinutes',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, sport: { ...i.profile.sport, preferredSessionMinutes: 25 } },
    }),
  },
  {
    field: 'profile.sport.equipment',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, sport: { ...i.profile.sport, equipment: ['none'] } },
    }),
  },
  {
    field: 'profile.sport.experience',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, sport: { ...i.profile.sport, experience: 'advanced' } },
    }),
  },
  {
    field: 'profile.sport.preferredActivities',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, sport: { ...i.profile.sport, preferredActivities: ['swimming'] } },
    }),
  },
  {
    field: 'profile.sport.dislikedActivities',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, sport: { ...i.profile.sport, dislikedActivities: ['gym'] } },
    }),
  },
  {
    field: 'profile.nutrition.cooksAtHome',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, nutrition: { ...i.profile.nutrition, cooksAtHome: 'often' } },
    }),
  },
  {
    field: 'profile.nutrition.timeForCookingMin',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, nutrition: { ...i.profile.nutrition, timeForCookingMin: 60 } },
    }),
  },
  {
    field: 'profile.nutrition.eatsOutPerWeek',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, nutrition: { ...i.profile.nutrition, eatsOutPerWeek: 6 } },
    }),
  },
  {
    field: 'profile.nutrition.dietaryPattern',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, nutrition: { ...i.profile.nutrition, dietaryPattern: 'vegan' } },
    }),
  },
  {
    field: 'profile.nutrition.mealsPerDay',
    vary: (i) => ({
      ...i,
      profile: { ...i.profile, nutrition: { ...i.profile.nutrition, mealsPerDay: 5 } },
    }),
  },
  {
    field: 'constraints.no_training_on',
    vary: (i) => ({
      ...i,
      constraints: [
        { kind: 'time', hard: true, value: { type: 'no_training_on', weekdays: ['tue', 'thu'] } },
      ],
    }),
  },
]

describe('stage one onboarding fields', () => {
  it.each(STAGE_1_FIELDS)('$field changes the plan', ({ vary }) => {
    expect(planFingerprint(vary(base))).not.toBe(baseline)
  })
})

/**
 * Deliberately NOT stage one. Each was checked against the same test and found
 * to leave the first plan untouched, so asking for it up front would cost the
 * user a question and buy nothing. They are still collected later, where they
 * do matter — sleep times for recovery tracking, life situation for context.
 */
const STAGE_2_FIELDS = [
  'schedule.wakeTime',
  'schedule.sleepTime',
  'schedule.weekendDiffers',
  'profile.lifeSituation',
] as const

describe('fields deferred to stage two', () => {
  it.each(STAGE_2_FIELDS)('%s does not affect the first plan', (field) => {
    const varied: PlanInput =
      field === 'profile.lifeSituation'
        ? { ...base, profile: { ...base.profile, lifeSituation: 'employed' } }
        : field === 'schedule.weekendDiffers'
          ? { ...base, schedule: { ...base.schedule, weekendDiffers: true } }
          : field === 'schedule.wakeTime'
            ? { ...base, schedule: { ...base.schedule, wakeTime: '05:00' } }
            : { ...base, schedule: { ...base.schedule, sleepTime: '01:00' } }

    // Documents the current state honestly. If a later step starts using one of
    // these, this test fails and the field moves back into stage one.
    expect(planFingerprint(varied)).toBe(baseline)
  })
})
