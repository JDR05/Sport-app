// The AI adapter contract.
//
// Three implementations exist: a deterministic mock (default, no key needed), a
// Claude adapter, and a null adapter used to prove the product works with no AI
// at all. Which one runs is configuration, not a decision the calling code makes.

import type { GoalClassification, PlanProposal, Suggestions } from './schemas'
import type { PlanInput, PlanResult } from '@/lib/domain/types'

/** Never throws. A failed call is a value, so callers cannot forget to handle it. */
export type AiResult<T> =
  | { ok: true; value: T; source: 'ai' }
  | { ok: false; reason: AiFailure; detail: string }

export type AiFailure =
  | 'no_api_key'
  | 'timeout'
  | 'invalid_json'
  | 'schema_invalid'
  | 'implausible'
  | 'api_error'
  | 'disabled'

export interface AiAdapter {
  readonly name: string
  classifyGoal(rawText: string): Promise<AiResult<GoalClassification>>
  suggest(input: PlanInput, plan: PlanResult): Promise<AiResult<Suggestions>>
  /**
   * Actions for the plan itself — the lever from ADR-041. Takes the input
   * only, not a plan: it runs *before* one exists, because for an unusual goal
   * it is what the plan will be built from.
   */
  proposePlan(input: PlanInput): Promise<AiResult<PlanProposal>>
}

export type AiConfig = {
  apiKey: string | undefined
  classifyModel: string
  suggestModel: string
  timeoutMs: number
}
