// Public entry point of the planning engine.
//
// The engine is pure: no database, no network, no React, no clock. Everything
// it needs arrives in PlanInput, which is what makes the personalisation and
// goal-orientation gates cheap enough to run on every commit.

import { assertPlanInvariants } from './safety'
import { applyHardLimits } from './hardLimits'
import { buildStrategy } from './strategy'
import type { PlanInput, PlanResult } from '@/lib/domain/types'

/**
 * Builds a week plan for any goal. Throws PlanInvariantError if the result
 * would violate a safety limit — a caller cannot ship an unsafe plan by
 * ignoring a return value.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const { strategy, items, assumptions, rationale } = buildStrategy(input)

  // The person's own hard limits, applied after every track has had its say.
  // Only ever makes the week smaller — see hardLimits.ts for why this is a
  // final pass rather than a rule each archetype has to remember.
  const plan: PlanResult = {
    strategy: { ...strategy, goalTrack: { ...strategy.goalTrack, items: applyHardLimits(strategy.goalTrack.items, input) } },
    items: applyHardLimits(items, input),
    assumptions,
    rationale,
  }
  assertPlanInvariants(plan, input)
  return plan
}

export { assertPlanInvariants, PlanInvariantError } from './safety'
export { classifyGoalText } from './classify'
export type { Classification } from './classify'
export { ARCHETYPES, strategyFor } from './archetypes'
export { planSignature, signatureDistance, describePlan } from './signature'
export type { PlanSignature } from './signature'
