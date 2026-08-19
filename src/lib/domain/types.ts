// Shared types for the planning engine.
//
// Enum-like values are taken from the generated database types rather than
// redeclared, so a migration that changes an enum breaks compilation here
// instead of drifting silently.

import type { Enums } from '@/lib/db/database.types'

export type PlanDomain = Enums<'plan_domain'>
export type PlanItemStatus = Enums<'plan_item_status'>
export type MetricClass = Enums<'metric_class'>
export type ConstraintKind = Enums<'constraint_kind'>

/** The MVP plans exactly these three domains. See ADR-010. */
export type MvpDomain = Extract<PlanDomain, 'training' | 'nutrition' | 'movement'>

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: readonly Weekday[] = [
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
] as const

export type TimeSlot = 'early' | 'midday' | 'evening'

export type SexAtBirth = 'female' | 'male' | 'unspecified'

export type LifeSituation = 'student' | 'employed' | 'shift_work' | 'self_employed' | 'unemployed'

export type WorkPattern = 'student' | 'office' | 'remote' | 'shift' | 'irregular'

export type Experience = 'beginner' | 'intermediate' | 'advanced'

export type Activity =
  | 'gym' | 'bodyweight' | 'running' | 'cycling' | 'swimming'
  | 'football' | 'climbing' | 'walking' | 'yoga'

export type Equipment = 'none' | 'home_basics' | 'home_gym' | 'gym_membership'

export type CookingFrequency = 'never' | 'sometimes' | 'often'

export type DietaryPattern = 'omnivore' | 'vegetarian' | 'vegan'

// ---------------------------------------------------------------- input ---

export type SportProfile = {
  preferredActivities: Activity[]
  dislikedActivities: Activity[]
  sessionsPerWeekTarget: number | null
  preferredSessionMinutes: number | null
  equipment: Equipment[]
  experience: Experience | null
}

export type NutritionProfile = {
  cooksAtHome: CookingFrequency | null
  timeForCookingMin: number | null
  eatsOutPerWeek: number | null
  dietaryPattern: DietaryPattern | null
  mealsPerDay: number | null
}

export type Profile = {
  birthYear: number | null
  heightCm: number | null
  sexAtBirth: SexAtBirth | null
  lifeSituation: LifeSituation | null
  sport: SportProfile
  nutrition: NutritionProfile
}

export type Goal = {
  title: string
  /** ISO date. Null means "no date given" and is treated as an open horizon. */
  targetDate: string | null
}

export type GoalMetric = {
  metricKey: 'weight_kg'
  startValue: number
  targetValue: number
  unit: string
}

export type ConstraintValue =
  | { type: 'no_training_on'; weekdays: Weekday[] }
  | { type: 'max_session_minutes'; minutes: number }
  | { type: 'no_activity'; activity: Activity }
  | { type: 'dietary'; pattern: DietaryPattern }

export type Constraint = {
  kind: ConstraintKind
  /** Hard constraints must never be violated; soft ones may be traded off. */
  hard: boolean
  value: ConstraintValue
}

export type FreeSlot = {
  weekday: Weekday
  /** 'HH:MM', 24 hour. */
  start: string
  minutes: number
}

export type Schedule = {
  wakeTime: string | null
  sleepTime: string | null
  workPattern: WorkPattern | null
  freeSlots: FreeSlot[]
  weekendDiffers: boolean
}

export type PersonalRule = {
  ruleKey: string
  ruleValue: Record<string, unknown>
  confidence: number
}

export type PlanInput = {
  /**
   * ISO date. Passed in rather than read from the clock: the engine must be
   * a pure function of its input so the same fixture always yields the same
   * plan.
   */
  today: string
  profile: Profile
  goal: Goal
  metrics: GoalMetric[]
  constraints: Constraint[]
  schedule: Schedule
  personalRules: PersonalRule[]
}

// --------------------------------------------------------------- output ---

export type TrainingModality = 'gym' | 'bodyweight' | 'sport' | 'mixed'

export type NutritionApproach =
  | 'meal_prep' | 'structured' | 'simple_swaps' | 'eating_out_aware'

export type MovementApproach = 'step_target' | 'walk_blocks' | 'commute'

export type DeficitTier = 'mild' | 'moderate'

/** Why something is in the plan, and which user input drove it. */
export type Rationale = {
  text: string
  basedOn: string[]
}

/** Recorded whenever an input was missing and the engine had to fill it in. */
export type Assumption = {
  field: string
  assumed: string
  reason: string
}

export type WeekStrategy = {
  weekStart: string
  targetDate: string
  targetDateAdjusted: boolean
  ratePerWeekKg: number
  dailyNeedKcal: number
  targetIntakeKcal: number
  deficitKcal: number
  deficitTier: DeficitTier
  trainingSessions: number
  trainingWeekdays: Weekday[]
  restWeekdays: Weekday[]
  trainingModality: TrainingModality
  sessionMinutes: number
  nutritionApproach: NutritionApproach
  movementApproach: MovementApproach
  dailyStepTarget: number | null
}

export type PlannedItem = {
  scheduledOn: string
  domain: MvpDomain
  title: string
  plannedDurationMin: number | null
  timeSlot: TimeSlot | null
  rationale: Rationale
  details: Record<string, unknown>
}

export type PlanResult = {
  strategy: WeekStrategy
  items: PlannedItem[]
  assumptions: Assumption[]
  /** Strategy-level reasoning. Per-item reasoning lives on the item. */
  rationale: Rationale[]
}
