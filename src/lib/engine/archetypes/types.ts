// The contract every goal archetype implements.
//
// The point of this interface is that safety lives with the strategy. A calorie
// floor belongs to body composition, a ten percent volume cap to endurance, a
// never-recommend-less-sleep rule to sleep goals. Adding an archetype means
// adding its limits in the same file, so a new goal type cannot arrive without
// its own guardrails. See ADR-025.

import type { PlanContext } from '../context'
import type { GoalArchetype, GoalTrack, PlanInput, PlanResult } from '@/lib/domain/types'

export type ClampedGoal = {
  adjusted: boolean
  targetDate: string | null
  /** User facing, always phrased as a commitment with a date, never a refusal. */
  reason: string
}

export interface ArchetypeStrategy {
  archetype: GoalArchetype
  /** German label for the UI. */
  label: string
  /**
   * Caps an unrealistic goal by moving the date rather than the rate. Returns
   * `adjusted: false` for archetypes where there is no rate to cap.
   */
  clampGoal(ctx: PlanContext): ClampedGoal
  planGoalTrack(ctx: PlanContext): GoalTrack
  /** Throws on violation. Called in addition to the shared invariants. */
  assertInvariants(plan: PlanResult, input: PlanInput): void
}
