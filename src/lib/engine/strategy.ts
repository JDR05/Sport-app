// Turns a profile, a goal and a week's worth of free time into a week strategy.
//
// This is where personalisation is actually earned. Every branch below reads a
// concrete user input; a field that never reaches a branch here is a field that
// should not be asked for in stage one of the onboarding, and the field
// efficacy test enforces exactly that.

import {
  DEFAULT_SESSIONS_PER_WEEK,
  DEFAULT_SESSION_MINUTES,
  FALLBACK,
  MAX_CONSECUTIVE_TRAINING_DAYS,
  MILD_DEFICIT_THRESHOLD,
  MIN_REST_DAYS,
  STEP_TARGET,
} from './constants'
import { startOfWeek } from './dates'
import { computeEnergy, targetIntake } from './energy'
import { clampGoal, deficitForRate, longestTrainingRun, maxWeeklyLossKg } from './safety'
import {
  WEEKDAYS,
  type Activity,
  type Assumption,
  type MovementApproach,
  type NutritionApproach,
  type PlanInput,
  type Rationale,
  type TrainingModality,
  type Weekday,
  type WeekStrategy,
} from '@/lib/domain/types'

const SPORT_ACTIVITIES: Activity[] = ['running', 'cycling', 'swimming', 'football', 'climbing']

/** A slot shorter than this cannot hold a useful session. */
const MIN_VIABLE_SESSION_MINUTES = 20

export type StrategyResult = {
  strategy: WeekStrategy
  assumptions: Assumption[]
  rationale: Rationale[]
}

export function buildStrategy(input: PlanInput): StrategyResult {
  const assumptions: Assumption[] = []
  const rationale: Rationale[] = []
  const { profile, schedule } = input

  const experience = profile.sport.experience ?? FALLBACK.experience
  if (profile.sport.experience === null) {
    assumptions.push({
      field: 'profile.sport.experience',
      assumed: 'Einsteiger',
      reason: 'Kein Leistungsstand angegeben. Einsteiger bekommt die vorsichtigste Belastung und die meisten Ruhetage.',
    })
  }

  // ------------------------------------------------------------ training ---
  const excludedDays = hardExcludedWeekdays(input)
  const hardMinutesCap = hardSessionMinutesCap(input)

  const availableDays = WEEKDAYS.filter(
    (day) =>
      !excludedDays.includes(day) &&
      longestSlotOn(input, day) >= MIN_VIABLE_SESSION_MINUTES,
  )

  const desiredSessions =
    profile.sport.sessionsPerWeekTarget ?? DEFAULT_SESSIONS_PER_WEEK[experience]
  if (profile.sport.sessionsPerWeekTarget === null) {
    assumptions.push({
      field: 'profile.sport.sessionsPerWeekTarget',
      assumed: `${desiredSessions}× pro Woche`,
      reason: 'Keine gewünschte Trainingshäufigkeit angegeben. Der Wert richtet sich nach dem Leistungsstand.',
    })
  }

  const maxByRest = WEEKDAYS.length - MIN_REST_DAYS[experience]
  const sessions = Math.max(0, Math.min(desiredSessions, availableDays.length, maxByRest))
  const trainingWeekdays = spreadAcrossWeek(availableDays, sessions)
  const restWeekdays = WEEKDAYS.filter((d) => !trainingWeekdays.includes(d))

  const modality = pickModality(input)
  const sessionMinutes = pickSessionMinutes({
    input,
    experience,
    trainingWeekdays,
    hardMinutesCap,
  })

  if (sessions < desiredSessions) {
    rationale.push({
      text:
        `Du wolltest ${desiredSessions}× pro Woche trainieren — im Plan stehen ${sessions} Einheiten. ` +
        `Mehr passt nicht in deine freien Zeitfenster, ohne die Ruhetage zu opfern.`,
      basedOn: ['profile.sport.sessionsPerWeekTarget', 'schedule.freeSlots'],
    })
  }

  // -------------------------------------------------------------- energy ---
  const weight = input.metrics.find((m) => m.metricKey === 'weight_kg')
  if (!weight) throw new Error('buildStrategy requires a weight_kg goal metric')

  const clamped = clampGoal({
    goal: input.goal,
    metrics: input.metrics,
    profile,
    today: input.today,
  })

  const energy = computeEnergy({
    profile,
    schedule,
    weightKg: weight.startValue,
    today: input.today,
    sessionsPerWeek: sessions,
  })
  assumptions.push(...energy.assumptions)

  const intake = targetIntake({
    dailyNeedKcal: energy.dailyNeedKcal,
    desiredDeficitKcal: deficitForRate(clamped.ratePerWeekKg),
    floorKcal: energy.intakeFloorKcal,
  })

  rationale.push({ text: clamped.reason, basedOn: ['goal.targetDate', 'metrics.weight_kg'] })

  if (intake.cappedBy === 'floor') {
    rationale.push({
      text:
        `Dein Tagesziel liegt bei ${intake.targetIntakeKcal} kcal. Tiefer geht die App nicht — ` +
        `das ist eine feste Untergrenze, unabhängig vom Zieldatum.`,
      basedOn: ['profile.sexAtBirth'],
    })
  }

  const rateShare = clamped.ratePerWeekKg / maxWeeklyLossKg(weight.startValue)

  // ----------------------------------------------------- nutrition, move ---
  const nutrition = pickNutritionApproach(input, assumptions)
  const movement = pickMovementApproach(input, assumptions)

  const strategy: WeekStrategy = {
    weekStart: startOfWeek(input.today),
    targetDate: clamped.targetDate,
    targetDateAdjusted: clamped.adjusted,
    ratePerWeekKg: clamped.ratePerWeekKg,
    dailyNeedKcal: energy.dailyNeedKcal,
    targetIntakeKcal: intake.targetIntakeKcal,
    deficitKcal: intake.deficitKcal,
    deficitTier: rateShare < MILD_DEFICIT_THRESHOLD ? 'mild' : 'moderate',
    trainingSessions: trainingWeekdays.length,
    trainingWeekdays,
    restWeekdays,
    trainingModality: modality,
    sessionMinutes,
    nutritionApproach: nutrition,
    movementApproach: movement,
    dailyStepTarget: stepTargetFor(movement, trainingWeekdays.length),
  }

  return { strategy, assumptions, rationale }
}

// ------------------------------------------------------------- helpers ----

export function hardExcludedWeekdays(input: PlanInput): Weekday[] {
  const days: Weekday[] = []
  for (const c of input.constraints) {
    if (c.hard && c.value.type === 'no_training_on') days.push(...c.value.weekdays)
  }
  return days
}

function hardSessionMinutesCap(input: PlanInput): number | null {
  let cap: number | null = null
  for (const c of input.constraints) {
    if (c.hard && c.value.type === 'max_session_minutes') {
      cap = cap === null ? c.value.minutes : Math.min(cap, c.value.minutes)
    }
  }
  return cap
}

export function longestSlotOn(input: PlanInput, day: Weekday): number {
  const slots = input.schedule.freeSlots.filter((s) => s.weekday === day)
  return slots.reduce((max, s) => Math.max(max, s.minutes), 0)
}

function excludedActivities(input: PlanInput): Activity[] {
  const out = [...input.profile.sport.dislikedActivities]
  for (const c of input.constraints) {
    if (c.value.type === 'no_activity') out.push(c.value.activity)
  }
  return out
}

export function pickModality(input: PlanInput): TrainingModality {
  const excluded = excludedActivities(input)
  const preferred = input.profile.sport.preferredActivities.filter((a) => !excluded.includes(a))
  const equipment = input.profile.sport.equipment

  // Wanting the gym is not the same as being able to go: without a membership
  // or a home gym, prescribing gym sessions is a plan the user cannot follow.
  // And an explicitly disliked activity is never prescribed, whatever the
  // equipment says.
  const gymExcluded = excluded.includes('gym')
  const hasGym =
    !gymExcluded && (equipment.includes('gym_membership') || equipment.includes('home_gym'))
  const hasSport = preferred.some((a) => SPORT_ACTIVITIES.includes(a))

  if (hasGym && hasSport) return 'mixed'
  if (hasGym) return 'gym'
  if (hasSport) return 'sport'
  return 'bodyweight'
}

function pickSessionMinutes(args: {
  input: PlanInput
  experience: keyof typeof DEFAULT_SESSION_MINUTES
  trainingWeekdays: Weekday[]
  hardMinutesCap: number | null
}): number {
  const { input, experience, trainingWeekdays, hardMinutesCap } = args
  let minutes = input.profile.sport.preferredSessionMinutes ?? DEFAULT_SESSION_MINUTES[experience]

  if (hardMinutesCap !== null) minutes = Math.min(minutes, hardMinutesCap)

  // A session cannot be longer than the shortest slot it has to fit into.
  const shortestSlot = trainingWeekdays.reduce(
    (min, day) => Math.min(min, longestSlotOn(input, day)),
    Number.POSITIVE_INFINITY,
  )
  if (Number.isFinite(shortestSlot)) minutes = Math.min(minutes, shortestSlot)

  return Math.max(MIN_VIABLE_SESSION_MINUTES, Math.round(minutes))
}

export function pickNutritionApproach(
  input: PlanInput,
  assumptions: Assumption[],
): NutritionApproach {
  const n = input.profile.nutrition

  const cooks = n.cooksAtHome ?? 'sometimes'
  if (n.cooksAtHome === null) {
    assumptions.push({
      field: 'profile.nutrition.cooksAtHome',
      assumed: 'gelegentlich',
      reason: 'Keine Angabe zum Kochen. Der Plan setzt auf einfache Umsetzung statt auf Meal-Prep.',
    })
  }

  const eatsOut = n.eatsOutPerWeek ?? 2
  const cookingTime = n.timeForCookingMin ?? 30

  if (eatsOut >= 4) return 'eating_out_aware'
  if (cooks === 'often' && cookingTime >= 45) return 'meal_prep'
  if (cooks === 'never') return 'simple_swaps'
  return 'structured'
}

export function pickMovementApproach(
  input: PlanInput,
  assumptions: Assumption[],
): MovementApproach {
  const pattern = input.schedule.workPattern
  if (pattern === null) {
    assumptions.push({
      field: 'schedule.workPattern',
      assumed: 'kein fester Rhythmus',
      reason: 'Kein Arbeits- oder Studienrhythmus angegeben. Ein Schrittziel funktioniert unabhängig vom Tagesablauf.',
    })
    return 'step_target'
  }
  if (pattern === 'office' || pattern === 'remote') return 'walk_blocks'
  if (pattern === 'student') return 'commute'
  return 'step_target'
}

function stepTargetFor(approach: MovementApproach, sessions: number): number | null {
  if (approach !== 'step_target') return null
  // The less structured training there is, the more the daily baseline matters.
  if (sessions >= 4) return STEP_TARGET.low
  if (sessions >= 2) return STEP_TARGET.medium
  return STEP_TARGET.high
}

/**
 * Picks up to `count` weekdays out of the available ones, spread as evenly as
 * availability allows: each pick maximises the circular distance to the days
 * already chosen.
 *
 * A candidate that would create too long a run of training days is skipped
 * rather than accepted — greedy spreading alone does not guarantee this. With
 * six available days and five wanted sessions it happily produces Monday to
 * Friday, which is five in a row. Fewer sessions is the correct answer there;
 * quietly dropping the rest-day rule is not.
 */
export function spreadAcrossWeek(
  available: Weekday[],
  count: number,
  maxRun: number = MAX_CONSECUTIVE_TRAINING_DAYS,
): Weekday[] {
  if (count <= 0 || available.length === 0) return []

  const picked: Weekday[] = []
  while (picked.length < count) {
    let best: Weekday | null = null
    let bestDistance = -1

    for (const day of available) {
      if (picked.includes(day)) continue
      if (longestTrainingRun([...picked, day]) > maxRun) continue

      const distance =
        picked.length === 0 ? 0 : Math.min(...picked.map((p) => circularDistance(p, day)))
      if (distance > bestDistance) {
        bestDistance = distance
        best = day
      }
    }

    // No day can be added without breaking the run limit.
    if (best === null) break
    picked.push(best)
  }

  return WEEKDAYS.filter((d) => picked.includes(d))
}

function circularDistance(a: Weekday, b: Weekday): number {
  const raw = Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
  return Math.min(raw, WEEKDAYS.length - raw)
}
