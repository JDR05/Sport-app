// Shared types for the planning engine.
//
// Enum-like values are taken from the generated database types rather than
// redeclared, so a migration that changes an enum breaks compilation here
// instead of drifting silently.

import type { Enums } from '@/lib/db/database.types'

export type PlanDomain = Enums<'plan_domain'>
export type PlanTrack = Enums<'plan_track'>
export type PlanItemStatus = Enums<'plan_item_status'>
export type MetricClass = Enums<'metric_class'>
export type ConstraintKind = Enums<'constraint_kind'>

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: readonly Weekday[] = [
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
] as const

export type TimeSlot = 'early' | 'midday' | 'evening'

export type SexAtBirth = 'female' | 'male' | 'unspecified'

export type WorkPattern = 'student' | 'office' | 'remote' | 'shift' | 'irregular'

export type Experience = 'beginner' | 'intermediate' | 'advanced'

export type Activity =
  | 'gym' | 'bodyweight' | 'running' | 'cycling' | 'swimming'
  | 'football' | 'climbing' | 'walking' | 'yoga'

export type Equipment = 'none' | 'home_basics' | 'home_gym' | 'gym_membership'

export type CookingFrequency = 'never' | 'sometimes' | 'often'

export type DietaryPattern = 'omnivore' | 'vegetarian' | 'vegan'

export type SleepQuality = 'poor' | 'ok' | 'good'

export type FocusStruggle = 'low' | 'medium' | 'high'

// ------------------------------------------------------------ the goal ----

/**
 * The user writes their goal in their own words; it is then classified into one
 * of these. `general_health` is the fallback — an unrecognised goal gets the
 * health baseline plus AI suggestions, never a refusal. See
 * docs/GOAL_ARCHETYPES.md.
 *
 * Taken from the database enum rather than declared here, so that adding an
 * archetype in a migration without teaching the engine about it is a
 * compilation error instead of a runtime surprise.
 */
export type GoalArchetype = Enums<'goal_archetype'>

export type ClassifiedBy = Enums<'goal_classified_by'>

export const GOAL_ARCHETYPES: readonly GoalArchetype[] = [
  'body_composition', 'strength', 'endurance',
  'sleep_recovery', 'nutrition_quality', 'habit_routine', 'general_health',
] as const

export type Goal = {
  /** Exactly what the user typed. Never overwritten — it is shown back to them. */
  rawText: string
  archetype: GoalArchetype
  targetDate: string | null
  /** Where the classification came from, so the UI can be honest about it. */
  classifiedBy: ClassifiedBy
}

/**
 * Deliberately not tied to weight. `metricKey` is free text; some goals — most
 * habit goals — have no numeric target at all and carry an empty metric list.
 */
export type GoalMetric = {
  metricKey: string
  startValue: number | null
  targetValue: number | null
  /**
   * The most recent measurement, or null before there is one.
   *
   * Measurements were recorded, drawn on the Progress chart, and then never
   * read by anything that plans. So the plan was computed from the start value
   * for ever: someone four kilos into a five-kilo goal still got the deficit
   * for the whole five, and someone who had arrived kept getting a deficit
   * they no longer needed. See ADR-077.
   */
  currentValue: number | null
  unit: string
}

/**
 * Whether the goal metric has arrived, in whichever direction it was going.
 *
 * Direction matters: a weight goal usually counts down, an endurance or
 * strength goal counts up, and someone gaining weight counts up too. Comparing
 * against the start is the only way to know which.
 */
export function metricReached(metric: GoalMetric | undefined): boolean {
  if (!metric) return false
  const { startValue: start, targetValue: target, currentValue: current } = metric
  if (start === null || target === null || current === null) return false
  if (start === target) return false
  return target < start ? current <= target : current >= target
}

// --------------------------------------------------------- the person ----

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
  vegetablePortionsPerDay: number | null
  sugaryDrinksPerDay: number | null
}

/** Matters for sleep goals the way calories matter for body goals. */
export type SleepProfile = {
  usualBedtime: string | null
  usualWakeTime: string | null
  quality: SleepQuality | null
  wakesAtNight: boolean | null
  screenBeforeBed: boolean | null
}

/** Matters for habit and focus goals. */
export type MindProfile = {
  screenTimeHoursPerDay: number | null
  focusStruggle: FocusStruggle | null
  existingRoutines: string[]
}

export type Profile = {
  birthYear: number | null
  heightCm: number | null
  weightKg: number | null
  sexAtBirth: SexAtBirth | null
  sport: SportProfile
  nutrition: NutritionProfile
  sleep: SleepProfile
  mind: MindProfile
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

/**
 * Something that is already in the week and is not up for negotiation:
 * football training on Tuesday, a late shift, a course, picking up a child.
 *
 * The distinction from a free slot matters. A free slot is time the person
 * *offered*; a commitment is time already spent. Without them the planner sees
 * a Tuesday evening that looks empty, plans a session into it, and the person
 * gets a plan that was never possible — or, worse, a second training session on
 * the day they already train.
 */
export type CommitmentKind = 'sport' | 'work' | 'study' | 'care' | 'other'

export type Commitment = {
  /** What the person calls it: "Fußballtraining", "Spätschicht". Shown back. */
  label: string
  weekday: Weekday
  /** 'HH:MM', 24 hour. */
  start: string
  minutes: number
  kind: CommitmentKind
  /**
   * For sport, what it actually is. The plan reasons about load with it: a
   * football session is training, so the week does not need another one on top.
   */
  activity: Activity | null
}

export type Schedule = {
  workPattern: WorkPattern | null
  freeSlots: FreeSlot[]
  commitments: Commitment[]
  /**
   * 'HH:MM' per weekday, partial. A day that is absent is unknown, and unknown
   * is never read as a number — the engine says less rather than guessing when
   * somebody has to be up.
   *
   * Per weekday rather than one value for the week, because the people this
   * app is for do not have one: a student's week has seven different mornings,
   * shift work inverts, and it is the Wednesday alarm that decides whether
   * Tuesday evening has any room left in it.
   */
  wakeTimes: Partial<Record<Weekday, string>>
}

export type PersonalRule = {
  ruleKey: string
  ruleValue: Record<string, unknown>
  confidence: number
  /**
   * True while the rule is only being tested by a running experiment. The
   * planner applies it either way — a trial that changed nothing would test
   * nothing — but it is not part of the personal model yet, so the Playbook
   * does not claim it as something learned.
   */
  trial?: boolean
}

/**
 * What the model contributed, already validated, as plain data.
 *
 * It arrives as *input* to the engine rather than being fetched from inside it,
 * which keeps generatePlan pure: no clock, no network, same input, same plan.
 * It also means every AI-proposed action runs through the identical invariant
 * checks as an archetype-produced one — see docs/AI_CAPABILITIES.md.
 */
export type ProposedAction = {
  title: string
  /** Why *this person*: names something they told the app. */
  reasoning: string
  /**
   * What the action does — the mechanism, said generally.
   *
   * A separate field from `reasoning` because they answer different questions,
   * and an app that only answers the first is a list of instructions from an
   * authority. Optional: proposals stored before this existed have none, and a
   * missing explanation is a missing sentence rather than a broken plan.
   */
  effect?: string | null
  domain: PlanDomain
  minutes: number
  timesPerWeek: number
  preferredSlot: TimeSlot | 'any'
}

export type AiProposal = {
  headline: string
  actions: ProposedAction[]
  reasoning: string
  /**
   * `augment` puts these on top of what the archetype planned. `takeover` makes
   * them the goal track, for a goal no archetype fits.
   */
  mode: 'augment' | 'takeover'
}

export type PlanInput = {
  /**
   * ISO date. Passed in rather than read from the clock: the engine must be a
   * pure function of its input so the same fixture always yields the same plan.
   */
  today: string
  profile: Profile
  goal: Goal
  metrics: GoalMetric[]
  constraints: Constraint[]
  schedule: Schedule
  personalRules: PersonalRule[]
  /** Absent when no key is configured, or when the model failed or was refused. */
  aiProposal?: AiProposal | null
  /**
   * Answers to questions the model asked before planning.
   *
   * Sits on the input rather than beside it because it is exactly what the
   * rest of this type is: things the person told the app. The engine ignores
   * it — free text is not something a deterministic rule can schedule — but it
   * is part of the intake, and keeping it here means the proposal is built
   * from one object rather than two that could drift apart.
   */
  intakeAnswers?: IntakeAnswer[]
}

/** One question the model asked, and what came back. */
export type IntakeAnswer = {
  question: string
  /** Null when the person skipped it. Skipping is allowed everywhere here. */
  answer: string | null
}

// --------------------------------------------------------- the output ----

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

/**
 * How often an action recurs inside the week.
 *
 * A calorie corridor, protein at every meal, a bedtime — these are standing
 * rules, true every day. They were being planned as one-off items on a
 * hardcoded weekday, which produced two problems at once: "Eiweiß zu jeder
 * Hauptmahlzeit" appeared on a Wednesday and nowhere else, which is simply
 * illogical to read; and the whole nutrition side of a weight goal was
 * measured by a single tick per week, so the behaviour metric the adaptive
 * engine may draw conclusions from was measuring almost nothing.
 *
 * The engine still emits one item per rule — the invariants count rules, not
 * days — and the week is materialised into real daily rows when it is stored.
 */
export type Cadence = 'daily' | 'weekly'

export type PlannedItem = {
  scheduledOn: string
  domain: PlanDomain
  /** Which of the two tracks this action belongs to. */
  track: 'goal' | 'baseline'
  title: string
  plannedDurationMin: number | null
  timeSlot: TimeSlot | null
  rationale: Rationale
  /** Absent means 'weekly': a thing that happens once, on that day. */
  cadence?: Cadence
  details: Record<string, unknown>
}

/**
 * The archetype-specific half of the plan. Each strategy fills this in its own
 * terms — calories for body composition, weekly volume for endurance, a single
 * habit for habit goals.
 */
export type GoalTrack = {
  archetype: GoalArchetype
  headline: string
  summary: string[]
  items: PlannedItem[]
  /** Structural features for the personalisation and goal-orientation gates. */
  signature: Record<string, string>
}

/** The health baseline that runs under every goal, whatever it is. */
export type BaselineTrack = {
  items: PlannedItem[]
  /** Domains the goal track already covers, so the baseline stays out of them. */
  suppressedDomains: PlanDomain[]
}

export type WeekStrategy = {
  weekStart: string
  archetype: GoalArchetype
  targetDate: string | null
  targetDateAdjusted: boolean
  goalTrack: GoalTrack
  baseline: BaselineTrack
}

export type PlanResult = {
  strategy: WeekStrategy
  items: PlannedItem[]
  assumptions: Assumption[]
  /** Strategy-level reasoning. Per-item reasoning lives on the item. */
  rationale: Rationale[]
}
