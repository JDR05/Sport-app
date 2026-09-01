// Safety limits that hold under every goal.
//
// Archetype-specific limits live with their strategy — a calorie floor belongs
// to body composition, a ten percent volume cap to endurance. What is left here
// is what is true regardless of the goal, plus the dispatcher that makes sure
// the archetype's own checks always run too.

import {
  MAX_CONSECUTIVE_TRAINING_DAYS,
  MAX_ITEMS_PER_DAY,
  MAX_WEEKLY_EXERTION_MIN,
  STRENUOUS_MINUTES,
} from './constants'
import { longestRun } from './context'
import { PlanInvariantError } from './errors'
import { strategyFor } from './archetypes'
import { WEEKDAYS, type PlanInput, type PlanResult, type Weekday } from '@/lib/domain/types'

export { PlanInvariantError } from './errors'

/**
 * Throws on the first violated invariant. Runs the shared checks, then hands
 * over to the archetype — so a goal type can never ship without its own limits
 * being enforced.
 */
export function assertPlanInvariants(plan: PlanResult, input: PlanInput): void {
  assertSharedInvariants(plan, input)
  strategyFor(plan.strategy.archetype).assertInvariants(plan, input)
}

/**
 * What counts as exertion, whatever the model chose to call it.
 *
 * Every load limit in this engine used to read `domain === 'training'`. The
 * domain is a label the AI supplies, `movement` is open to all seven
 * archetypes, and `movement` is the natural word for a run — so a proposal
 * could put twenty-two hours of hill running into a week and every invariant
 * would count zero. The hard constraints a person set themselves went the same
 * way: "never train on Wednesday" was enforced only against items labelled
 * `training`.
 *
 * A body does not read labels. These two predicates are the fix, and they are
 * deliberately in the shared invariants rather than in each archetype: a rule
 * repeated seven times is a rule six of them will drift away from.
 */
function isExertion(item: PlanResult['items'][number]): boolean {
  return (
    (item.domain === 'training' || item.domain === 'movement') &&
    (item.plannedDurationMin ?? 0) > 0
  )
}

/** Exertion a body has to recover from, as opposed to a walk. */
function isStrenuous(item: PlanResult['items'][number]): boolean {
  if (item.domain === 'training') return true
  return item.domain === 'movement' && (item.plannedDurationMin ?? 0) >= STRENUOUS_MINUTES
}

/** Weekly items are one occurrence; a daily rule is seven. */
function weeklyMinutes(item: PlanResult['items'][number]): number {
  return (item.plannedDurationMin ?? 0) * (item.cadence === 'daily' ? 7 : 1)
}

function assertSharedInvariants(plan: PlanResult, input: PlanInput): void {
  // ------------------------------------------------- actions per day ----
  const perDay = new Map<string, number>()
  for (const item of plan.items) {
    perDay.set(item.scheduledOn, (perDay.get(item.scheduledOn) ?? 0) + 1)
  }
  for (const [date, count] of perDay) {
    if (count > MAX_ITEMS_PER_DAY) {
      throw new PlanInvariantError(
        `${date} carries ${count} actions, above the ceiling of ${MAX_ITEMS_PER_DAY}`,
      )
    }
  }

  // ----------------------------------------------------- training load --
  //
  // Counted by what the actions are, not by what they are labelled. See
  // isExertion above for the hole this closes.
  const totalMinutes = plan.items.filter(isExertion).reduce((sum, i) => sum + weeklyMinutes(i), 0)
  if (totalMinutes > MAX_WEEKLY_EXERTION_MIN) {
    throw new PlanInvariantError(
      `${totalMinutes} minutes of exertion in one week exceeds the ceiling of ${MAX_WEEKLY_EXERTION_MIN}`,
    )
  }

  const trainingDays = WEEKDAYS.filter((day, index) => {
    const date = addDaysIso(plan.strategy.weekStart, index)
    return plan.items.some((i) => i.scheduledOn === date && isStrenuous(i))
  })
  if (longestRun(trainingDays) > MAX_CONSECUTIVE_TRAINING_DAYS) {
    throw new PlanInvariantError(
      `${longestRun(trainingDays)} consecutive training days exceeds the maximum of ${MAX_CONSECUTIVE_TRAINING_DAYS}`,
    )
  }

  // ------------------------------------------------- hard constraints ---
  for (const constraint of input.constraints) {
    if (!constraint.hard) continue
    const v = constraint.value

    if (v.type === 'no_training_on') {
      const clash = trainingDays.filter((d) => v.weekdays.includes(d))
      if (clash.length > 0) {
        throw new PlanInvariantError(`training scheduled on excluded day(s): ${clash.join(', ')}`)
      }
    }

    if (v.type === 'max_session_minutes') {
      for (const item of plan.items) {
        // Any exertion session, not only one labelled `training`. A ninety
        // minute "movement" block breaks a forty-five minute hard limit just
        // as thoroughly.
        if (!isExertion(item)) continue
        if ((item.plannedDurationMin ?? 0) > v.minutes) {
          throw new PlanInvariantError(
            `session of ${item.plannedDurationMin} min exceeds the hard limit of ${v.minutes} min`,
          )
        }
      }
    }
  }

  // --------------------------------------------------- per-item rules ---
  for (const item of plan.items) {
    if (item.rationale.text.trim().length === 0) {
      throw new PlanInvariantError(`item "${item.title}" has no rationale`)
    }
    if (item.rationale.basedOn.length === 0) {
      throw new PlanInvariantError(`item "${item.title}" cites no user input`)
    }
    // Compensatory logic is forbidden under every goal: "ate more today, eat
    // less tomorrow" is the mechanism the product must never reproduce.
    if ('compensatesFor' in item.details) {
      throw new PlanInvariantError(
        `item "${item.title}" contains compensatory logic, which is forbidden`,
      )
    }
  }

  // ------------------------------------------------------ target date ---
  // A date that has already passed is not a deadline, and a plan working
  // towards one is working towards nothing. Four archetypes used to let it
  // through untouched, and Progress printed it under "wie gewünscht".
  //
  // Checked here rather than trusted to each archetype: this is the sort of
  // thing a new goal type forgets, and forgetting it is invisible.
  const { targetDate } = plan.strategy
  if (targetDate !== null && targetDate <= input.today) {
    throw new PlanInvariantError(
      `target date ${targetDate} is not in the future (today is ${input.today})`,
    )
  }

  // ---------------------------------------- the baseline stays a baseline --
  const goalItems = plan.items.filter((i) => i.track === 'goal').length
  if (goalItems === 0 && plan.strategy.archetype !== 'general_health') {
    throw new PlanInvariantError(
      `archetype ${plan.strategy.archetype} produced no goal actions at all`,
    )
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type { Weekday }
