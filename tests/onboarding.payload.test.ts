// The contract between the form and the server action.
//
// This is the seam that broke. `completeOnboarding` validates what the form
// sends, and nothing checked that the two agreed — the schema lived inside a
// `'use server'` file, which may only export async functions, so no test could
// reach it. The result was a rule that was true until it wasn't.
//
// What it wasn't: `wakeTimes` used `z.record` with a weekday enum as its key,
// and in Zod 4 that is **exhaustive** — it demands all seven days. The comment
// above it said "partial by design". So anybody who had not given a wake time
// for every single weekday was refused, and the empty `{}` the form sends when
// that step is skipped failed with seven issues at once. The message named no
// field, so there was nothing to act on either.

import { describe, expect, it } from 'vitest'
import { buildAnswers, EMPTY, toDraft } from '@/app/onboarding/draft'
import { onboardingSchema, refusal } from '@/app/onboarding/schema'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { StoredPlanInput } from '@/lib/db/plan-input'
import type { Weekday } from '@/lib/domain/types'

function stored(profileIndex = 3, goalIndex = 0): StoredPlanInput {
  const input = makeInput(PROFILES[profileIndex], GOALS[goalIndex])
  return {
    profile: input.profile,
    goal: input.goal,
    metrics: input.metrics,
    constraints: input.constraints,
    schedule: input.schedule,
    personalRules: input.personalRules,
    aiProposal: input.aiProposal,
  }
}

/** A draft good enough to submit, so a failure is about the field under test. */
function submittable(wakeTimes: Partial<Record<Weekday, string>>) {
  return { ...EMPTY, goalText: 'Ich möchte besser schlafen', wakeTimes }
}

describe('wake times are partial, as the intake promises', () => {
  const ALL: Partial<Record<Weekday, string>> = {
    mon: '07:00', tue: '07:00', wed: '07:00', thu: '07:00',
    fri: '07:00', sat: '09:00', sun: '09:00',
  }

  // The exact shape that was rejected in production: the step was skipped.
  it('accepts none at all', () => {
    const parsed = onboardingSchema.safeParse(buildAnswers(submittable({}), 'sleep_recovery', 'user'))
    expect(parsed.success).toBe(true)
  })

  it('accepts some of the week', () => {
    const partial = { mon: '06:30', wed: '06:30', fri: '06:30' }
    const parsed = onboardingSchema.safeParse(buildAnswers(submittable(partial), 'sleep_recovery', 'user'))
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.schedule.wakeTimes).toEqual(partial)
  })

  it('accepts the whole week', () => {
    const parsed = onboardingSchema.safeParse(buildAnswers(submittable(ALL), 'sleep_recovery', 'user'))
    expect(parsed.success).toBe(true)
  })

  // Partial must not mean lenient: a broken time and an unknown day still fail,
  // or the fix would have traded one silent wrong for another.
  it('still rejects a time that is not a time', () => {
    const parsed = onboardingSchema.safeParse(
      buildAnswers(submittable({ mon: '25:99' } as Partial<Record<Weekday, string>>), 'sleep_recovery', 'user'),
    )
    expect(parsed.success).toBe(false)
  })

  it('still rejects a day that is not a day', () => {
    const payload = buildAnswers(submittable({}), 'sleep_recovery', 'user')
    const wrong = { ...payload, schedule: { ...payload.schedule, wakeTimes: { funday: '07:00' } } }
    expect(onboardingSchema.safeParse(wrong).success).toBe(false)
  })
})

describe('a stored intake can be submitted again', () => {
  // "Ziel wechseln" prefills from what was saved. Every fixture has to survive
  // the round trip, or changing a goal is refused for reasons the person had no
  // hand in — which is exactly what happened.
  for (let i = 0; i < PROFILES.length; i++) {
    it(`profile ${i} round-trips into a valid payload`, () => {
      const draft = { ...toDraft(stored(i)), goalText: 'Ein neues Ziel formulieren' }
      const parsed = onboardingSchema.safeParse(buildAnswers(draft, 'general_health', 'user'))
      expect(parsed.success ? [] : parsed.error.issues.map((x) => x.path.join('.'))).toEqual([])
    })
  }
})

describe('a refusal says which step to look at', () => {
  it('names the step, not the field path', () => {
    expect(refusal([{ path: ['schedule', 'wakeTimes', 'thu'] }])).toBe('Bitte schau noch mal bei: Alltag.')
  })

  it('names every affected step once', () => {
    const message = refusal([
      { path: ['goal', 'rawText'] },
      { path: ['profile', 'heightCm'] },
      { path: ['goal', 'targetDate'] },
    ])
    expect(message).toBe('Bitte schau noch mal bei: Ziel, Über dich.')
  })

  // A path the map does not know must not produce "Bitte schau noch mal bei: ."
  it('falls back to a plain message when it cannot place the field', () => {
    expect(refusal([{ path: ['somethingNew'] }])).toBe(
      'Das Speichern hat nicht geklappt. Versuch es bitte noch einmal.',
    )
  })

  it('never returns an empty instruction', () => {
    expect(refusal([]).length).toBeGreaterThan(10)
  })
})
