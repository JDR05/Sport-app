// Public entry point of the AI layer.
//
// Which adapter runs is configuration. Calling code never picks — it asks for
// a classification or a suggestion and always gets an answer, because a failed
// AI call falls through to the deterministic path.

import { ClaudeAdapter } from './claude'
import { MockAdapter, NullAdapter } from './mock'
import type { AiAdapter, AiConfig, AiResult } from './types'
import type { GoalClassification, Suggestions } from './schemas'
import type { PlanInput, PlanResult } from '@/lib/domain/types'

/** Sensible for a small app; a slow answer is worse than a deterministic one. */
const DEFAULT_TIMEOUT_MS = 20_000

export function readConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    // Both tasks are configurable separately: classification is a small job that
    // a cheap model handles well, while the suggestions are where quality shows.
    classifyModel: env.AI_CLASSIFY_MODEL ?? 'claude-opus-5',
    suggestModel: env.AI_SUGGEST_MODEL ?? 'claude-opus-5',
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

export type Suggested = {
  value: Suggestions | null
  source: 'ai' | 'fallback' | 'none'
  fallbackReason?: string
}

/**
 * Suggestions are an enhancement, not a requirement. When nothing usable comes
 * back the app shows the plan without them — never an error, never a placeholder
 * pretending to be advice.
 */
export async function suggest(
  input: PlanInput,
  plan: PlanResult,
  adapter?: AiAdapter,
): Promise<Suggested> {
  const primary = adapter ?? createAdapter()
  const result: AiResult<Suggestions> = await primary.suggest(input, plan)

  if (result.ok) {
    return { value: result.value, source: primary.name === 'claude' ? 'ai' : 'fallback' }
  }

  if (primary.name === 'null') {
    return { value: null, source: 'none', fallbackReason: result.reason }
  }

  const fallback = await new MockAdapter().suggest(input, plan)
  return fallback.ok
    ? { value: fallback.value, source: 'fallback', fallbackReason: result.reason }
    : { value: null, source: 'none', fallbackReason: result.reason }
}

export { MockAdapter, NullAdapter } from './mock'
export { ClaudeAdapter } from './claude'
export { checkClassification, checkSuggestions } from './validate'
export { CLASSIFY_PROMPT_VERSION, SUGGEST_PROMPT_VERSION } from './prompts'
export type { AiAdapter, AiConfig, AiResult, AiFailure } from './types'
export type { GoalClassification, Suggestions, Suggestion } from './schemas'
