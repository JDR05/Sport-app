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

/**
 * The ceiling on real exertion in one week, across every domain.
 *
 * Exists because every other load limit was keyed on `domain === 'training'`,
 * and the domain is a label the model chooses. `movement` is open to all seven
 * archetypes and is the obvious word for a run, so three proposed actions of
 * 90 minutes, five times a week, were scheduled as real checkable actions
 * while every count that decides whether a week is safe reported them as
 * absent: 1213 minutes of exertion certified as compliant, on a beginner.
 *
 * 600 is set against measurement, not taste. The most demanding plan the
 * engine builds for any of the ten fixture profiles under any of the seven
 * goals is 350 minutes, so this leaves most of a factor of two of headroom for
 * a plan nobody has written yet, and still refuses the attack by a wide
 * margin. A limit tight enough to be argued with would get loosened; one that
 * only ever fires on something absurd does not.
 */
export const MAX_WEEKLY_EXERTION_MIN = 600

/**
 * When a movement action stops being a walk and starts being a session.
 *
 * The baseline plans a short daily walk, and counting that as a training day
 * would leave every week with seven consecutive ones.
 *
 * Thirty, not forty-five, because forty-five was a cliff exactly one value
 * wide: `checkProposal` refuses any action over 45 minutes, so of the whole
 * legal range only 45 itself counted, and "40 Minuten locker laufen" — the
 * most ordinary number a model writes — landed underneath without trying.
 * Four consecutive days of it were accepted for a 58-year-old beginner.
 */
export const STRENUOUS_MINUTES = 45

/**
 * The same line, drawn lower for an action the model proposed.
 *
 * Two numbers because the two cases are not alike. An engine-authored
 * `movement` item is a walk the baseline deliberately kept gentle — thirty
 * minutes of it is not a day a body has to recover from, and counting it as
 * one made every ordinary week look like six consecutive training days.
 *
 * A proposed item is different: `checkProposal` refuses anything over 45, so a
 * threshold at 45 could only ever fire on that single value, and "40 Minuten
 * locker laufen" — the most ordinary number a model writes — slid underneath.
 * The lower bar applies exactly where the label cannot be trusted.
 */
export const PROPOSED_STRENUOUS_MINUTES = 30

/** A slot shorter than this cannot hold a useful session. */
export const MIN_VIABLE_SESSION_MINUTES = 20

/**
 * The shortest thing worth putting on a plan at all.
 *
 * A separate floor from the one above, and the difference between them is the
 * whole point. Twenty minutes is what a *session* needs to be worth changing
 * clothes for. Five minutes of breathing before sleep, ten pages of a book, a
 * two-minute wind-down — those are not sessions, and measuring them against a
 * session's floor is why the app used to refuse to put anything at all on the
 * evening somebody has football: the ninety minutes of training left fifteen
 * minutes of the free slot, fifteen is under twenty, so the day vanished from
 * the plan entirely.
 *
 * "Wenn zum Beispiel so wie Meditieren ist, dann kann man das ja auch an dem
 * Tag machen, wo man schon Sport macht, weil das ist ja nicht richtig Sport."
 */
export const MIN_LIGHT_MINUTES = 5

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

// ------------------------------------------------------------- the night --
//
// What a late commitment costs the evening after it.
//
// The product owner's case: football until nine, up at five. That night is
// fixed at roughly seven hours before the plan has said anything, and putting
// another session into the same evening spends hours that are not there. The
// app has to see that, or it plans a week that only works on paper.

/**
 * Between a commitment ending and actually being asleep: getting home, eating,
 * winding down. An hour is conservative for someone leaving a pitch or a gym,
 * and being conservative here errs towards *more* sleep, which is the only
 * direction the safety rules allow.
 */
export const WIND_DOWN_MINUTES = 60

/**
 * The night the plan protects. At or below this, the evening is treated as
 * spoken for and nothing else is scheduled into it.
 *
 * Seven hours is the low end of the adult range, chosen deliberately rather
 * than an ideal eight: the app is describing a limit it will not push someone
 * past, not prescribing a bedtime.
 */
export const MIN_NIGHT_HOURS = 7
