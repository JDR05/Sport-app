// Safety constants. Single source of truth: no magic number for any of these
// may appear anywhere else in the codebase.
//
// These are deterministic code rather than prompt instructions, because a
// prompt is not a guarantee and a test is. See ADR-008.

import type { Experience, SexAtBirth } from '@/lib/domain/types'

/**
 * Mifflin-St Jeor coefficients. The male variant yields the higher basal rate.
 *
 * When an input is missing the engine always picks the variant that leads to
 * MORE food and LESS load, never the reverse — underestimating the daily need
 * would make the plan more restrictive, which is the unsafe direction.
 */
export const BASAL_RATE = {
  weightFactor: 10,
  heightFactor: 6.25,
  ageFactor: 5,
  offset: { male: 5, female: -161 },
} as const

/** Activity factor applied to the basal rate, chosen from schedule and training load. */
export const ACTIVITY_FACTOR = {
  sedentary: 1.35,
  light: 1.5,
  moderate: 1.65,
  high: 1.8,
} as const

/**
 * Hard lower bound on daily intake. Never undercut, whatever the goal or the
 * timeline demands. Unspecified sex gets the higher floor.
 */
export const INTAKE_FLOOR_KCAL: Record<SexAtBirth, number> = {
  female: 1200,
  male: 1500,
  unspecified: 1500,
}

/**
 * The deficit may never exceed this share of the daily need. The absolute floor
 * alone is not enough: someone with a high daily need could stay above it and
 * still be on a crash diet.
 */
export const MAX_DEFICIT_SHARE = 0.25

/** Weekly rate is capped twice: relative to body weight, and in absolute terms. */
export const MAX_WEEKLY_LOSS_SHARE = 0.0075
export const MAX_WEEKLY_LOSS_KG = 1.0

/** Rule of thumb for converting between a weight rate and a calorie deficit. */
export const KCAL_PER_KG = 7700

/** Below this share of the maximum rate the deficit counts as mild. */
export const MILD_DEFICIT_THRESHOLD = 0.5

/** Rest days are mandatory. Beginners get more. */
export const MIN_REST_DAYS: Record<Experience, number> = {
  beginner: 2,
  intermediate: 1,
  advanced: 1,
}

/** No matter the experience level, never more than this many training days in a row. */
export const MAX_CONSECUTIVE_TRAINING_DAYS = 3

/** Used when the user gave no training target of their own. */
export const DEFAULT_SESSIONS_PER_WEEK: Record<Experience, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
}

export const DEFAULT_SESSION_MINUTES: Record<Experience, number> = {
  beginner: 30,
  intermediate: 45,
  advanced: 60,
}

/**
 * Fallbacks for missing profile data. Each is chosen on the "more food" side of
 * plausible: a younger age and a greater height both raise the estimated need.
 */
export const FALLBACK = {
  age: 30,
  heightCm: 175,
  experience: 'beginner',
  sexAtBirth: 'unspecified',
} as const

export const STEP_TARGET = {
  low: 7000,
  medium: 8500,
  high: 10000,
} as const

/** An open-ended goal is planned against this horizon. */
export const DEFAULT_HORIZON_WEEKS = 12
