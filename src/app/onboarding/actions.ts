'use server'

// Taking a finished onboarding and storing it.
//
// The client sends its answers, so they are validated here before anything is
// written — a server action is a public HTTP endpoint, and "our own form posts
// to it" is not a security property. The profile id comes from the verified
// session, never from the payload; row level security enforces the same thing
// again in Postgres.
//
// The schema is the one the engine already relies on, so anything that gets
// through here is something generatePlan can plan for.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isoDate } from '@/lib/domain/isoDate'
import { requireUser } from '@/lib/auth/session'
import { saveOnboarding } from '@/lib/db/save-onboarding'
import {
  commitmentSchema, constraintValueSchema, freeSlotSchema, mindSchema,
  nutritionSchema, sleepSchema, sportSchema,
} from '@/lib/db/schemas'
import { GOAL_ARCHETYPES } from '@/lib/domain/types'

const onboardingSchema = z.object({
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
    wakeTimes: z.record(
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

export type CompleteResult = { error: string } | never

export async function completeOnboarding(payload: unknown): Promise<CompleteResult> {
  const user = await requireUser()

  const parsed = onboardingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: 'Ein paar Angaben konnten nicht gespeichert werden. Bitte prüf sie kurz.' }
  }

  const saved = await saveOnboarding(user.id, parsed.data)
  if (!saved.ok) {
    return { error: 'Speichern hat nicht geklappt. Versuch es bitte noch einmal.' }
  }

  // The app layout reads the plan on the server, so its cache has to go.
  revalidatePath('/', 'layout')
  redirect('/today')
}
