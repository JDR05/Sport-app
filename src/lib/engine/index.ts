// Public entry point of the planning engine.
//
// The engine is pure: no database, no network, no React, no clock. Everything
// it needs arrives in PlanInput, which is what makes the personalisation gate
// and the invariant checks cheap enough to run on every commit.

import { assertPlanInvariants } from './safety'
import { buildItems } from './schedule'
import { buildStrategy } from './strategy'
import type { PlanInput, PlanResult } from '@/lib/domain/types'

/**
 * Builds a week plan. Throws PlanInvariantError if the result would violate a
 * safety limit — a caller cannot accidentally ship an unsafe plan by ignoring
 * a return value.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const { strategy, assumptions, rationale } = buildStrategy(input)
  const items = buildItems(input, strategy)

  const plan: PlanResult = { strategy, items, assumptions, rationale }
  assertPlanInvariants(plan, input)
  return plan
}

export { assertPlanInvariants, clampGoal, PlanInvariantError } from './safety'
export { planSignature, signatureDistance, describeStrategy } from './signature'
export type { PlanSignature } from './signature'
