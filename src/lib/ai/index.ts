// Public entry point of the AI layer.
//
// Which adapter runs is configuration. Calling code never picks — it asks for
// a classification or a plan proposal and always gets an answer, because a failed
// AI call falls through to the deterministic path.

import { ClaudeAdapter } from './claude'
import { OpenAiCompatibleAdapter, type CompatibleConfig } from './openai-compatible'
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

/**
 * Which model, if any, answers.
 *
 * The order is deliberate. An explicit AI_ADAPTER always wins, so a broken
 * provider can be switched off without touching keys. Claude is preferred when
 * a key is present because it is the one whose output quality was measured
 * against these prompts. A compatible endpoint — Groq, Google AI Studio,
 * OpenRouter, Mistral, Cerebras, anything speaking chat-completions — is next.
 * Nothing configured means the deterministic adapter, silently and by design:
 * the product is fully usable in that state, and that is the whole point.
 *
 * @param timeoutMs a smaller budget than the configured one, for a call that
 *   sits in front of a person waiting for a screen. The default is generous
 *   because the onboarding can afford to wait; a page load cannot.
 */
export function createAdapter(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs?: number,
): AiAdapter {
  if (env.AI_ADAPTER === 'null') return new NullAdapter()
  if (env.AI_ADAPTER === 'mock') return new MockAdapter()

  const base = readConfig(env)
  const config = timeoutMs === undefined ? base : { ...base, timeoutMs }

  const compatible = readCompatibleConfig(env, config.timeoutMs)
  if (env.AI_ADAPTER === 'compat') {
    return compatible ? new OpenAiCompatibleAdapter(compatible) : new MockAdapter()
  }

  if (config.apiKey) return new ClaudeAdapter(config)
  if (compatible) return new OpenAiCompatibleAdapter(compatible)
  return new MockAdapter()
}

/**
 * Null unless both halves are present.
 *
 * A base URL without a key, or the other way round, is a half-finished setup
 * rather than a request to call something — and guessing would mean every
 * request failing against an endpoint nobody meant to configure.
 */
export function readCompatibleConfig(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): CompatibleConfig | null {
  const baseUrl = env.AI_COMPAT_BASE_URL?.trim()
  const apiKey = env.AI_COMPAT_KEY?.trim()
  if (!baseUrl || !apiKey) return null

  const model = env.AI_COMPAT_MODEL?.trim()
  if (!model) return null

  return {
    baseUrl,
    apiKey,
    // One model unless a second is named. Most free tiers have exactly one
    // worth using, and two variables nobody sets is two ways to be wrong.
    classifyModel: env.AI_COMPAT_CLASSIFY_MODEL?.trim() || model,
    proposeModel: model,
    timeoutMs,
    // Shown to nobody, but it is what `source` reports internally, so it
    // should say which machine actually answered.
    label: env.AI_COMPAT_LABEL?.trim() || 'compatible',
  }
}


/**
 * Who actually receives the data, named from the endpoint rather than a label.
 *
 * The consent sentence has to name the recipient — informed consent that says
 * "an unseren KI-Partner" is not informed. Derived from the configured base URL
 * because that is the thing the request is genuinely sent to: a label is a
 * string somebody typed, and a label that drifts from the URL would make the
 * consent text quietly false.
 */
const PROVIDERS: ReadonlyArray<[string, string]> = [
  ['generativelanguage.googleapis.com', 'Google (Gemini)'],
  ['api.groq.com', 'Groq'],
  ['openrouter.ai', 'OpenRouter'],
  ['api.mistral.ai', 'Mistral AI'],
  ['api.cerebras.ai', 'Cerebras'],
  ['api.openai.com', 'OpenAI'],
]

/** Null when nothing is configured — then there is nothing to consent to. */
export function providerName(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.AI_ADAPTER === 'null' || env.AI_ADAPTER === 'mock') return null
  if (env.AI_ADAPTER !== 'compat' && env.ANTHROPIC_API_KEY) return 'Anthropic (Claude)'

  const config = readCompatibleConfig(env, 0)
  if (!config) return null

  let host: string
  try {
    host = new URL(config.baseUrl).hostname
  } catch {
    return null
  }

  const known = PROVIDERS.find(([domain]) => host === domain || host.endsWith(`.${domain}`))
  return known ? known[1] : host
}

export type Classified = {
  value: GoalClassification
  /** Shown to the user, so the app is honest about where the answer came from. */
  source: 'ai' | 'fallback'
  /**
   * Why the model did not answer, when it did not.
   *
   * Typed as the failure union rather than a loose string so a screen can
   * branch on it. "The provider rejected the key" and "the answer failed the
   * safety check" lead to two different next steps, and only one of them is
   * the person's to take.
   */
  fallbackReason?: AiFailure
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

export { MockAdapter, NullAdapter, WithheldAdapter } from './mock'
export { OpenAiCompatibleAdapter, type CompatibleConfig } from './openai-compatible'
export { ClaudeAdapter } from './claude'
export { checkClassification, checkProposal, checkQuestions, checkWeeklyNote } from './validate'
// Exported so tests can hold the contract itself to account, not just its
// consumers — the schema is the boundary, so it is worth asserting directly.
export { goalClassificationSchema, intakeQuestionsSchema, planProposalSchema } from './schemas'
export { CLASSIFY_PROMPT_VERSION, PROPOSE_PROMPT_VERSION, QUESTIONS_PROMPT_VERSION } from './prompts'
export type { AiAdapter, AiConfig, AiResult, AiFailure } from './types'
export type {
  GoalClassification, IntakeQuestion, IntakeQuestions, PlanProposal, ProposedAction,
} from './schemas'
