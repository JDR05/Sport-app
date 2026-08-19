// Safety limits that hold under every goal.
//
// Archetype-specific limits live with their strategy — a calorie floor belongs
// to body composition, a ten percent volume cap to endurance. What is left here
// is what is true regardless of the goal, plus the dispatcher that makes sure
// the archetype's own checks always run too.

import { MAX_CONSECUTIVE_TRAINING_DAYS, MAX_ITEMS_PER_DAY } from './constants'
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
  const trainingDays = WEEKDAYS.filter((day, index) => {
    const date = addDaysIso(plan.strategy.weekStart, index)
    return plan.items.some((i) => i.scheduledOn === date && i.domain === 'training')
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
        if (item.domain !== 'training') continue
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
