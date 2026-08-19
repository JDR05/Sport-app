// Safety constants. Single source of truth: no magic number for any of these
// may appear anywhere else in the codebase.
//
// Split into shared limits and per-archetype limits. A limit that applies to
// everything applies to nothing — a calorie floor is meaningless for a sleep
// goal, a weekly volume cap meaningless for a habit. See ADR-025 and
// docs/GOAL_ARCHETYPES.md.

import type { Experience, SexAtBirth } from '@/lib/domain/types'

// ------------------------------------------------------------- shared ----

/** Rest days are mandatory under every goal. Beginners get more. */
export const MIN_REST_DAYS: Record<Experience, number> = {
  beginner: 2,
  intermediate: 1,
  advanced: 1,
}

/** Whatever the goal, never more than this many training days in a row. */
export const MAX_CONSECUTIVE_TRAINING_DAYS = 3

/** Today shows three to five actions. This is a hard ceiling, not a guideline. */
export const MAX_ITEMS_PER_DAY = 5

/** A slot shorter than this cannot hold a useful session. */
export const MIN_VIABLE_SESSION_MINUTES = 20

/** An open-ended goal is planned against this horizon. */
export const DEFAULT_HORIZON_WEEKS = 12

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
 * Fallbacks for missing profile data. Each is chosen on the "more food, less
 * load" side of plausible.
 */
export const FALLBACK = {
  age: 30,
  heightCm: 175,
  weightKg: 75,
  experience: 'beginner',
  sexAtBirth: 'unspecified',
} as const

export const STEP_TARGET = {
  low: 7000,
  medium: 8500,
  high: 10000,
} as const

// -------------------------------------------------- body_composition ----

/**
 * Mifflin-St Jeor coefficients. The male variant yields the higher basal rate.
 *
 * When an input is missing the engine always picks the variant that leads to
 * MORE food and LESS load — underestimating the daily need would make the plan
 * more restrictive, which is the unsafe direction.
 */
export const BASAL_RATE = {
  weightFactor: 10,
  heightFactor: 6.25,
  ageFactor: 5,
  offset: { male: 5, female: -161 },
} as const

export const ACTIVITY_FACTOR = {
  sedentary: 1.35,
  light: 1.5,
  moderate: 1.65,
  high: 1.8,
} as const

/** Hard lower bound on daily intake. Unspecified sex gets the higher floor. */
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

/** Weight change is capped twice: relative to body weight, and absolutely. */
export const MAX_WEEKLY_CHANGE_SHARE = 0.0075
export const MAX_WEEKLY_CHANGE_KG = 1.0

/** Rule of thumb for converting between a weight rate and a calorie delta. */
export const KCAL_PER_KG = 7700

/** Below this share of the maximum rate the deficit counts as mild. */
export const MILD_DEFICIT_THRESHOLD = 0.5

// ------------------------------------------------------------ endurance --
/**
 * The classic ten percent rule: weekly volume may grow by at most this much.
 * The single most effective guard against overuse injury in endurance training.
 */
export const MAX_WEEKLY_VOLUME_GROWTH = 0.1

/** An endurance week always contains at least one full rest day. */
export const ENDURANCE_MIN_REST_DAYS = 1

// ------------------------------------------------------------- strength --
/** Never two maximal sessions for the same muscle group back to back. */
export const STRENGTH_MIN_DAYS_BETWEEN_HEAVY = 2

/** Weekly load progression stays modest. */
export const MAX_WEEKLY_LOAD_GROWTH = 0.05

// -------------------------------------------------------- sleep_recovery --
/**
 * The app may never recommend less sleep than this, and may never recommend
 * reducing sleep at all — whatever the goal, whatever the schedule.
 */
export const MIN_SLEEP_HOURS = 7
export const MAX_SLEEP_HOURS = 9

/** How far the bedtime may move per week. Sleep shifts slowly or not at all. */
export const MAX_BEDTIME_SHIFT_MIN_PER_WEEK = 30

// ----------------------------------------------------- nutrition_quality --
/** Only additive recommendations. Nothing is forbidden, things are added. */
export const MAX_NUTRITION_ADDITIONS_PER_WEEK = 3

// --------------------------------------------------------- habit_routine --
/**
 * One Change at a Time, taken literally. More than one new habit at once is the
 * most reliable way to end up with none.
 */
export const MAX_NEW_HABITS_AT_ONCE = 1

/** A habit that is too big to fail at is better than one too big to do. */
export const HABIT_MIN_MINUTES = 5
export const HABIT_MAX_MINUTES = 20
