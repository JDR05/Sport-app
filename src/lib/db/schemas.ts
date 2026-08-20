// The boundary between stored JSON and the typed domain.
//
// Four profile blocks and the free slots are jsonb. Postgres guarantees they
// are objects and arrays; it does not guarantee that `sessionsPerWeekTarget` is
// a number. So every read is parsed, and every parse has a fallback: a row
// written by an older version of the onboarding must still produce a usable
// plan rather than a crash on the Today screen.
//
// `.catch()` on each field is the load-bearing part. It turns "this one answer
// is unreadable" into "this one answer is missing", which the engine already
// knows how to handle — it records an assumption and plans anyway.

import { z } from 'zod'
import type {
  AiProposal, Commitment, Constraint, FreeSlot, MindProfile, NutritionProfile, Profile, Schedule,
  SleepProfile, SportProfile,
} from '@/lib/domain/types'

const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
const activity = z.enum([
  'gym', 'bodyweight', 'running', 'cycling', 'swimming',
  'football', 'climbing', 'walking', 'yoga',
])
const equipment = z.enum(['none', 'home_basics', 'home_gym', 'gym_membership'])
const dietaryPattern = z.enum(['omnivore', 'vegetarian', 'vegan'])

/** 'HH:MM', 24 hour. Anything else is treated as not answered. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const sportSchema = z.object({
  preferredActivities: z.array(activity).catch([]),
  dislikedActivities: z.array(activity).catch([]),
  sessionsPerWeekTarget: z.number().int().min(0).max(14).nullable().catch(null),
  preferredSessionMinutes: z.number().int().min(5).max(300).nullable().catch(null),
  equipment: z.array(equipment).catch([]),
  experience: z.enum(['beginner', 'intermediate', 'advanced']).nullable().catch(null),
})

export const nutritionSchema = z.object({
  cooksAtHome: z.enum(['never', 'sometimes', 'often']).nullable().catch(null),
  timeForCookingMin: z.number().int().min(0).max(300).nullable().catch(null),
  eatsOutPerWeek: z.number().int().min(0).max(30).nullable().catch(null),
  dietaryPattern: dietaryPattern.nullable().catch(null),
  mealsPerDay: z.number().int().min(1).max(10).nullable().catch(null),
  vegetablePortionsPerDay: z.number().int().min(0).max(20).nullable().catch(null),
  sugaryDrinksPerDay: z.number().int().min(0).max(20).nullable().catch(null),
})

export const sleepSchema = z.object({
  usualBedtime: timeOfDay.nullable().catch(null),
  usualWakeTime: timeOfDay.nullable().catch(null),
  quality: z.enum(['poor', 'ok', 'good']).nullable().catch(null),
  wakesAtNight: z.boolean().nullable().catch(null),
  screenBeforeBed: z.boolean().nullable().catch(null),
})

export const mindSchema = z.object({
  screenTimeHoursPerDay: z.number().min(0).max(24).nullable().catch(null),
  focusStruggle: z.enum(['low', 'medium', 'high']).nullable().catch(null),
  existingRoutines: z.array(z.string().max(200)).max(20).catch([]),
})

export const freeSlotSchema = z.object({
  weekday,
  start: timeOfDay,
  minutes: z.number().int().min(5).max(1440),
})

export const commitmentSchema = z.object({
  label: z.string().trim().min(1).max(80),
  weekday,
  start: timeOfDay,
  minutes: z.number().int().min(5).max(1440),
  kind: z.enum(['sport', 'work', 'study', 'care', 'other']),
  activity: activity.nullable(),
})

export const constraintValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('no_training_on'), weekdays: z.array(weekday) }),
  z.object({ type: z.literal('max_session_minutes'), minutes: z.number().int().min(5).max(300) }),
  z.object({ type: z.literal('no_activity'), activity }),
  z.object({ type: z.literal('dietary'), pattern: dietaryPattern }),
])

// An empty object parses to all-nulls, which is exactly right for a profile
// nobody has filled in yet.
const EMPTY = {} as const

export function readSport(value: unknown): SportProfile {
  return sportSchema.parse(sportSchema.safeParse(value).success ? value : EMPTY)
}
export function readNutrition(value: unknown): NutritionProfile {
  return nutritionSchema.parse(nutritionSchema.safeParse(value).success ? value : EMPTY)
}
export function readSleep(value: unknown): SleepProfile {
  return sleepSchema.parse(sleepSchema.safeParse(value).success ? value : EMPTY)
}
export function readMind(value: unknown): MindProfile {
  return mindSchema.parse(mindSchema.safeParse(value).success ? value : EMPTY)
}

/** Slots that do not parse are dropped, not guessed at. */
export function readFreeSlots(value: unknown): FreeSlot[] {
  if (!Array.isArray(value)) return []
  const out: FreeSlot[] = []
  for (const raw of value) {
    const parsed = freeSlotSchema.safeParse(raw)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/**
 * Wake times that do not parse are dropped, not guessed at.
 *
 * A day with no answer stays absent rather than becoming a default hour. The
 * engine reasons about how much night is left; inventing a wake time would
 * make it reason confidently about a number nobody gave it.
 */
export function readWakeTimes(value: unknown): Schedule['wakeTimes'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Schedule['wakeTimes'] = {}
  for (const [day, time] of Object.entries(value)) {
    const parsedDay = weekday.safeParse(day)
    const parsed = timeOfDay.safeParse(time)
    if (parsedDay.success && parsed.success) out[parsedDay.data] = parsed.data
  }
  return out
}

/** Commitments that do not parse are dropped, not guessed at. */
export function readCommitments(value: unknown): Commitment[] {
  if (!Array.isArray(value)) return []
  const out: Commitment[] = []
  for (const raw of value) {
    const parsed = commitmentSchema.safeParse(raw)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

export function readWorkPattern(value: unknown): Schedule['workPattern'] {
  const parsed = z
    .enum(['student', 'office', 'remote', 'shift', 'irregular'])
    .safeParse(value)
  return parsed.success ? parsed.data : null
}

export function readSexAtBirth(value: unknown): Profile['sexAtBirth'] {
  const parsed = z.enum(['female', 'male', 'unspecified']).safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * A stored AI proposal, read back defensively.
 *
 * It was validated when it was written, but a row survives a deployment and
 * the shape may move. An unreadable proposal becomes no proposal, and the
 * archetype plans alone — the same fallback as no key at all.
 */
const storedProposalSchema = z.object({
  headline: z.string().min(1).max(120),
  reasoning: z.string().max(600),
  mode: z.enum(['augment', 'takeover']),
  actions: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        reasoning: z.string().max(400),
        domain: z.enum([
          'training', 'nutrition', 'movement', 'sleep', 'self_improvement', 'priority',
        ]),
        minutes: z.number().int().min(0).max(90),
        timesPerWeek: z.number().int().min(1).max(5),
        preferredSlot: z.enum(['early', 'midday', 'evening', 'any']),
      }),
    )
    .max(5),
})

export function readAiProposal(value: unknown): AiProposal | null {
  const parsed = storedProposalSchema.safeParse(value)
  return parsed.success && parsed.data.actions.length > 0 ? parsed.data : null
}

/**
 * A constraint whose value cannot be read is dropped rather than kept as a
 * half-understood object. A hard constraint the engine cannot interpret is
 * worse than no constraint: it looks respected while it is being ignored.
 */
export function readConstraintValue(value: unknown): Constraint['value'] | null {
  const parsed = constraintValueSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
