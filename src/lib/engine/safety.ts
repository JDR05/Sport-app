// Hard safety limits.
//
// Everything here is an invariant, not a preference. `assertPlanInvariants`
// throws rather than returning a warning: a plan that violates one of these
// must never reach a user, and a caller must not be able to ignore it by
// forgetting to check a return value.

import {
  MAX_CONSECUTIVE_TRAINING_DAYS,
  MAX_DEFICIT_SHARE,
  MAX_WEEKLY_LOSS_KG,
  MAX_WEEKLY_LOSS_SHARE,
  MIN_REST_DAYS,
  KCAL_PER_KG,
  DEFAULT_HORIZON_WEEKS,
  FALLBACK,
} from './constants'
import { addDays, daysBetween, formatGermanDate } from './dates'
import { intakeFloor } from './energy'
import { WEEKDAYS, type Goal, type GoalMetric, type PlanInput, type PlanResult, type Profile, type Weekday } from '@/lib/domain/types'

export class PlanInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanInvariantError'
  }
}

export function maxWeeklyLossKg(startWeightKg: number): number {
  return Math.min(MAX_WEEKLY_LOSS_SHARE * startWeightKg, MAX_WEEKLY_LOSS_KG)
}

export type ClampedGoal = {
  adjusted: boolean
  targetDate: string
  ratePerWeekKg: number
  totalLossKg: number
  /** User facing, always phrased as a commitment with a date, never as a refusal. */
  reason: string
}

/**
 * Caps the rate of loss and, if the user's date demands more than that, moves
 * the date instead of the rate.
 *
 * The wording matters as much as the arithmetic: the first thing the app does
 * must not be to tell the user no. It answers with a date it can stand behind.
 */
export function clampGoal(args: {
  goal: Goal
  metrics: GoalMetric[]
  profile: Profile
  today: string
}): ClampedGoal {
  const weight = args.metrics.find((m) => m.metricKey === 'weight_kg')
  if (!weight) {
    throw new PlanInvariantError('clampGoal requires a weight_kg goal metric')
  }

  const totalLossKg = Math.max(0, weight.startValue - weight.targetValue)
  const maxRate = maxWeeklyLossKg(weight.startValue)

  const requestedDate = args.goal.targetDate
  const weeksRequested = requestedDate
    ? daysBetween(args.today, requestedDate) / 7
    : DEFAULT_HORIZON_WEEKS

  const safeWeeks = totalLossKg > 0 ? Math.ceil(totalLossKg / maxRate) : 0
  const safeDate = addDays(args.today, safeWeeks * 7)

  if (weeksRequested <= 0 || weeksRequested < safeWeeks) {
    return {
      adjusted: true,
      targetDate: safeDate,
      ratePerWeekKg: round1(totalLossKg / Math.max(safeWeeks, 1)),
      totalLossKg,
      reason:
        `${formatDecimal(totalLossKg)} kg bis zum ${formatGermanDate(safeDate)} — ` +
        `das sind ${formatDecimal(totalLossKg / Math.max(safeWeeks, 1))} kg pro Woche. ` +
        `Schneller wäre nicht gesünder, und dieses Tempo hältst du auch durch.`,
    }
  }

  // With no date given the plan runs to the default horizon, and the date has
  // to be derived from that same horizon. Taking the earliest safe date here
  // instead would pair a nine week date with a twelve week rate.
  const weeksUsed = weeksRequested
  const rate = totalLossKg / weeksUsed
  const targetDate = requestedDate ?? addDays(args.today, Math.ceil(weeksUsed) * 7)
  return {
    adjusted: false,
    targetDate,
    ratePerWeekKg: round1(rate),
    totalLossKg,
    reason:
      `${formatDecimal(totalLossKg)} kg bis zum ${formatGermanDate(targetDate)} — ` +
      `das sind ${formatDecimal(rate)} kg pro Woche und liegt im sicheren Bereich.`,
  }
}

export function deficitForRate(ratePerWeekKg: number): number {
  return (ratePerWeekKg * KCAL_PER_KG) / 7
}

/**
 * Throws on the first violated invariant. Checked against every fixture profile
 * in the test suite, so a regression in the planner surfaces as a failing test
 * rather than as an unsafe recommendation.
 */
export function assertPlanInvariants(plan: PlanResult, input: PlanInput): void {
  const { strategy } = plan
  const weight = input.metrics.find((m) => m.metricKey === 'weight_kg')
  if (!weight) throw new PlanInvariantError('missing weight_kg goal metric')

  const floor = intakeFloor(input.profile)
  if (strategy.targetIntakeKcal < floor) {
    throw new PlanInvariantError(
      `intake ${strategy.targetIntakeKcal} kcal is below the floor of ${floor} kcal`,
    )
  }

  // One kcal of slack absorbs rounding; anything larger is a real breach.
  const shareCap = strategy.dailyNeedKcal * MAX_DEFICIT_SHARE
  if (strategy.deficitKcal > shareCap + 1) {
    throw new PlanInvariantError(
      `deficit ${strategy.deficitKcal} kcal exceeds ${Math.round(shareCap)} kcal ` +
        `(${MAX_DEFICIT_SHARE * 100}% of the daily need)`,
    )
  }

  const maxRate = maxWeeklyLossKg(weight.startValue)
  if (strategy.ratePerWeekKg > maxRate + 0.05) {
    throw new PlanInvariantError(
      `rate ${strategy.ratePerWeekKg} kg/week exceeds the cap of ${round1(maxRate)} kg/week`,
    )
  }

  const experience = input.profile.sport.experience ?? FALLBACK.experience
  const requiredRest = MIN_REST_DAYS[experience]
  if (strategy.restWeekdays.length < requiredRest) {
    throw new PlanInvariantError(
      `only ${strategy.restWeekdays.length} rest day(s) for a ${experience}, ` +
        `${requiredRest} required`,
    )
  }

  const run = longestTrainingRun(strategy.trainingWeekdays)
  if (run > MAX_CONSECUTIVE_TRAINING_DAYS) {
    throw new PlanInvariantError(
      `${run} consecutive training days exceeds the maximum of ${MAX_CONSECUTIVE_TRAINING_DAYS}`,
    )
  }

  for (const constraint of input.constraints) {
    if (!constraint.hard) continue
    const v = constraint.value
    if (v.type === 'no_training_on') {
      const clash = strategy.trainingWeekdays.filter((d) => v.weekdays.includes(d))
      if (clash.length > 0) {
        throw new PlanInvariantError(`training scheduled on excluded day(s): ${clash.join(', ')}`)
      }
    }
    if (v.type === 'max_session_minutes' && strategy.sessionMinutes > v.minutes) {
      throw new PlanInvariantError(
        `session of ${strategy.sessionMinutes} min exceeds the hard limit of ${v.minutes} min`,
      )
    }
  }

  for (const item of plan.items) {
    if (item.rationale.text.trim().length === 0) {
      throw new PlanInvariantError(`item "${item.title}" has no rationale`)
    }
    if (item.rationale.basedOn.length === 0) {
      throw new PlanInvariantError(`item "${item.title}" cites no user input`)
    }
    if ('compensatesFor' in item.details) {
      throw new PlanInvariantError(
        `item "${item.title}" contains compensatory logic, which is forbidden`,
      )
    }
    if (item.domain !== 'training' && item.domain !== 'nutrition' && item.domain !== 'movement') {
      throw new PlanInvariantError(`item "${item.title}" uses a domain outside the MVP`)
    }
  }
}

/**
 * Longest run of training days, counted across the week boundary: weeks repeat,
 * so Saturday–Sunday–Monday is three in a row even though the array wraps.
 */
export function longestTrainingRun(trainingWeekdays: Weekday[]): number {
  const flags = WEEKDAYS.map((d) => trainingWeekdays.includes(d))
  if (flags.every(Boolean)) return 7

  let longest = 0
  let current = 0
  for (const training of [...flags, ...flags]) {
    current = training ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return Math.min(longest, 7)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function formatDecimal(n: number): string {
  return round1(n).toFixed(1).replace('.', ',')
}
