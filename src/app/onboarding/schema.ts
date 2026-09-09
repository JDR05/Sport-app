// What a finished onboarding has to look like, and what to say when it doesn't.
//
// Split out of `actions.ts` rather than left there, and not for tidiness: a
// `'use server'` file may only export async functions, so while the schema
// lived next to the action it could not be imported by a test. The contract
// between the form and the server was the one thing in this flow nothing held
// to — and it broke exactly there. A validation rule no test can reach is a
// rule that is true until it isn't.
//
// The client sends these answers, so they are validated here before anything is
// written: a server action is a public HTTP endpoint, and "our own form posts
// to it" is not a security property. The profile id comes from the verified
// session, never from the payload.

import { z } from 'zod'
import { isoDate } from '@/lib/domain/isoDate'
import {
  commitmentSchema, constraintValueSchema, freeSlotSchema, mindSchema,
  nutritionSchema, sleepSchema, sportSchema,
} from '@/lib/db/schemas'
import { GOAL_ARCHETYPES } from '@/lib/domain/types'

export const onboardingSchema = z.object({
  profile: z.object({
    birthYear: z.number().int().min(1900).max(2100).nullable(),
    heightCm: z.number().min(80).max(260).nullable(),
    weightKg: z.number().min(25).max(400).nullable(),
    sexAtBirth: z.enum(['female', 'male', 'unspecified']).nullable(),
    sport: sportSchema,
    nutrition: nutritionSchema,
    sleep: sleepSchema,
    mind: mindSchema,
  }),
  goal: z.object({
    // Long enough to be a goal, short enough not to be an essay. The same cap
    // the AI endpoint applies.
    rawText: z.string().trim().min(3).max(500),
    archetype: z.enum(GOAL_ARCHETYPES),
    targetDate: isoDate.nullable(),
    classifiedBy: z.enum(['ai', 'keywords', 'user']),
  }),
  metrics: z
    .array(
      z.object({
        metricKey: z.string().min(1).max(64),
        startValue: z.number().nullable(),
        targetValue: z.number().nullable(),
        unit: z.string().max(16),
      }),
    )
    .max(10),
  schedule: z.object({
    workPattern: z.enum(['student', 'office', 'remote', 'shift', 'irregular']).nullable(),
    freeSlots: z.array(freeSlotSchema).max(50),
    commitments: z.array(commitmentSchema).max(30),
    // Partial by design: a weekday nobody answered stays absent, and the
    // engine says less rather than inventing an hour somebody has to be up.
    //
    // `partialRecord`, not `record`, and the difference is not cosmetic. With
    // an enum as its key `z.record` is **exhaustive** — it demands all seven
    // weekdays and rejects the object otherwise. So the sentence above stated
    // the intent while the code did the opposite: anybody who had not given a
    // wake time for every single day was refused. An empty `{}`, which is what
    // the form sends when that step is skipped, failed with seven issues at
    // once — and skipping it is the normal case.
    wakeTimes: z.partialRecord(
      z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    ),
  }),
  constraints: z
    .array(
      z.object({
        kind: z.enum(['time', 'dietary', 'equipment', 'dislike', 'medical_selfreport']),
        hard: z.boolean(),
        value: constraintValueSchema,
      }),
    )
    .max(30),
})

export type OnboardingPayload = z.infer<typeof onboardingSchema>

/**
 * Which step of the intake a rejected field belongs to.
 *
 * A map from the payload's own shape to the headings the person just walked
 * through — so a refusal can point at the screen they need rather than at the
 * whole form.
 */
const STEP_OF: Record<string, string> = {
  profile: 'Über dich',
  goal: 'Ziel',
  metrics: 'Messbar',
  schedule: 'Alltag',
  constraints: 'Grenzen',
}

/**
 * A refusal that says where to look.
 *
 * The old message was one sentence for every possible cause: "Ein paar Angaben
 * konnten nicht gespeichert werden. Bitte prüf sie kurz." It named no field, so
 * there was nothing to check and no way forward — and when it fired for a
 * reason that was not the person's fault at all, finding out why took a query
 * against the production database. A validation error the reader cannot act on
 * is a dead end wearing the costume of a form error.
 *
 * Field names are deliberately not shown. `schedule.wakeTimes.thu` means
 * nothing to somebody who saw a screen called "Alltag", and the step is the
 * unit they can actually navigate back to.
 */
export function refusal(issues: ReadonlyArray<{ path: PropertyKey[] }>): string {
  const steps = [...new Set(issues.map((i) => STEP_OF[String(i.path[0])]).filter(Boolean))]
  if (steps.length === 0) {
    return 'Das Speichern hat nicht geklappt. Versuch es bitte noch einmal.'
  }
  return `Bitte schau noch mal bei: ${steps.join(', ')}.`
}
