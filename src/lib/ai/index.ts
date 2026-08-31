// Public entry point of the AI layer.
//
// Which adapter runs is configuration. Calling code never picks — it asks for
// a classification or a plan proposal and always gets an answer, because a failed
// AI call falls through to the deterministic path.

import { ClaudeAdapter } from './claude'
import { MockAdapter, NullAdapter } from './mock'
import type { AiAdapter, AiConfig, AiFailure } from './types'
import type { GoalClassification, PlanProposal } from './schemas'
import type { PlanInput } from '@/lib/domain/types'

/** Sensible for a small app; a slow answer is worse than a deterministic one. */
const DEFAULT_TIMEOUT_MS = 20_000

export function readConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    // Both tasks are configurable separately: classification is a small job that
    // a cheap model handles well, while the proposal is where quality shows.
    classifyModel: env.AI_CLASSIFY_MODEL ?? 'claude-opus-5',
    // AI_SUGGEST_MODEL is the old name for the same thing and is still read, so
    // an environment configured before ADR-072 keeps working. Renaming a
    // variable that is already set in a deployment would silently fall back to
    // the default rather than fail, which is the worst of both outcomes.
    proposeModel: env.AI_PROPOSE_MODEL ?? env.AI_SUGGEST_MODEL ?? 'claude-opus-5',
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  }
}

export function createAdapter(env: NodeJS.ProcessEnv = process.env): AiAdapter {
  if (env.AI_ADAPTER === 'null') return new NullAdapter()
  if (env.AI_ADAPTER === 'mock') return new MockAdapter()

  const config = readConfig(env)
  // No key means the deterministic adapter, silently and by design. The product
  // is fully usable in that state — that is the whole point.
  return config.apiKey ? new ClaudeAdapter(config) : new MockAdapter()
}

export type Classified = {
  value: GoalClassification
  /** Shown to the user, so the app is honest about where the answer came from. */
  source: 'ai' | 'fallback'
  fallbackReason?: string
}

/**
 * Always returns a classification. When the model fails, is disabled, or produces
 * something that does not survive validation, the deterministic classifier
 * answers instead.
 */
export async function classifyGoal(rawText: string, adapter?: AiAdapter): Promise<Classified> {
  const primary = adapter ?? createAdapter()
  const result = await primary.classifyGoal(rawText)

  if (result.ok) {
    return { value: result.value, source: primary.name === 'claude' ? 'ai' : 'fallback' }
  }

  const fallback = await new MockAdapter().classifyGoal(rawText)
  if (!fallback.ok) throw new Error('the deterministic classifier must never fail')
  return { value: fallback.value, source: 'fallback', fallbackReason: result.reason }
}

/**
 * A plan proposal, or nothing.
 *
 * Nothing is an ordinary outcome, not an error: no key configured, the model
 * refused, the schema did not hold, a plausibility rule fired. The caller plans
 * deterministically in every one of those cases — which is why this returns a
 * value rather than throwing.
 */
export type Proposed = {
  proposal: PlanProposal | null
  source: 'ai' | 'none'
  reason?: AiFailure
}

export async function proposePlan(
  input: PlanInput,
  adapter: AiAdapter = createAdapter(),
): Promise<Proposed> {
  const result = await adapter.proposePlan(input)
  return result.ok
    ? { proposal: result.value, source: 'ai' }
    : { proposal: null, source: 'none', reason: result.reason }
}

export { MockAdapter, NullAdapter } from './mock'
export { ClaudeAdapter } from './claude'
export { checkClassification, checkProposal } from './validate'
// Exported so tests can hold the contract itself to account, not just its
// consumers — the schema is the boundary, so it is worth asserting directly.
export { goalClassificationSchema, planProposalSchema } from './schemas'
export { CLASSIFY_PROMPT_VERSION, PROPOSE_PROMPT_VERSION } from './prompts'
export type { AiAdapter, AiConfig, AiResult, AiFailure } from './types'
export type { GoalClassification, PlanProposal, ProposedAction } from './schemas'
