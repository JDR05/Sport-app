// Any provider that speaks the OpenAI chat-completions shape.
//
// Written this way on purpose. The product owner wants a free tier, and free
// tiers move: limits get cut, models get retired, providers change their terms.
// Groq, Google AI Studio, OpenRouter, Mistral, Cerebras and most others all
// expose `POST /chat/completions` with the same request body, so which of them
// is free this month becomes a matter of two environment variables rather than
// a code change and a review.
//
// Plain fetch rather than a client library: it is one POST with a JSON body,
// every provider's base URL differs, and a second SDK would add a dependency
// that only knows one of them.
//
// No `server-only` marker, matching the Claude adapter: the key comes from a
// variable without the NEXT_PUBLIC_ prefix, which Next never inlines into the
// client bundle, and the adapter is only ever constructed by createAdapter from
// server code. The marker would additionally make the module unimportable from
// a test, and the failure paths below are the part most worth testing.
//
// What is deliberately NOT here: prompts, schemas, and the safety checks.
// Those live in tasks.ts and are shared with the Claude adapter, because a
// weaker model produces restrictive or unsafe phrasing more often, not less —
// so the gate in front of it has to be exactly the same gate.

import {
  classifyTask, classifyUserMessage, proposeTask, proposeUserMessage, stripCodeFence,
  type AiTask,
} from './tasks'
import type { AiAdapter, AiResult } from './types'
import type { GoalClassification, PlanProposal } from './schemas'
import type { PlanInput } from '@/lib/domain/types'

export type CompatibleConfig = {
  /** Up to and including `/v1`, e.g. https://api.groq.com/openai/v1 */
  baseUrl: string
  apiKey: string
  classifyModel: string
  proposeModel: string
  timeoutMs: number
  /** The provider's own name, for the honest "where did this come from" line. */
  label: string
}

/** Minimal shape of the response; anything else is ignored. */
type ChatCompletion = {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
}

export class OpenAiCompatibleAdapter implements AiAdapter {
  readonly name: string
  private config: CompatibleConfig
  private fetchImpl: typeof fetch

  constructor(config: CompatibleConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config
    // Injectable so the failure paths can be tested without a network or a key.
    // Every one of them ends in the deterministic fallback, and that promise is
    // worth more than the happy path.
    this.fetchImpl = fetchImpl
    this.name = config.label
  }

  async classifyGoal(rawText: string): Promise<AiResult<GoalClassification>> {
    return this.call(classifyTask, this.config.classifyModel, classifyUserMessage(rawText))
  }

  async proposePlan(input: PlanInput): Promise<AiResult<PlanProposal>> {
    return this.call(proposeTask, this.config.proposeModel, proposeUserMessage(input))
  }

  private async call<T>(task: AiTask<T>, model: string, user: string): Promise<AiResult<T>> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      return { ok: false, reason: 'no_api_key', detail: 'no compatible endpoint configured' }
    }

    // AbortController rather than a client timeout option: fetch has no other
    // way to stop, and a request nobody is waiting for still costs the quota.
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), this.config.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          // Asked for, never relied on. Some providers honour it, some ignore
          // it, and one or two reject the field outright — so the prompt still
          // demands bare JSON and stripCodeFence still cleans up after it.
          response_format: { type: 'json_object' },
          // The app wants the same answer for the same input. This is a
          // classifier and a planner, not a writer.
          temperature: 0,
          max_tokens: task.maxTokens,
          messages: [
            { role: 'system', content: task.system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, reason: 'timeout', detail: `no response within ${this.config.timeoutMs} ms` }
      }
      return { ok: false, reason: 'api_error', detail: String(error).slice(0, 200) }
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      // 401 and 403 are a misconfigured key, which is worth telling apart from
      // a provider having a bad day — the first never fixes itself.
      const reason = response.status === 401 || response.status === 403 ? 'no_api_key' : 'api_error'
      const body = await response.text().catch(() => '')
      return { ok: false, reason, detail: `${response.status}: ${body.slice(0, 200)}` }
    }

    let payload: ChatCompletion
    try {
      payload = (await response.json()) as ChatCompletion
    } catch {
      return { ok: false, reason: 'invalid_json', detail: 'response body was not JSON' }
    }

    const choice = payload.choices?.[0]
    const text = choice?.message?.content?.trim() ?? ''
    if (text.length === 0) {
      // A refusal on these providers usually arrives as an empty message with
      // a content-filter finish reason rather than as an error.
      return {
        ok: false,
        reason: choice?.finish_reason === 'content_filter' ? 'implausible' : 'invalid_json',
        detail: `empty completion (finish_reason: ${choice?.finish_reason ?? 'none'})`,
      }
    }

    let json: unknown
    try {
      json = JSON.parse(stripCodeFence(text))
    } catch {
      return { ok: false, reason: 'invalid_json', detail: text.slice(0, 200) }
    }

    const result = task.parse(json)
    if (!result.ok) {
      return {
        ok: false,
        reason: result.implausible ? 'implausible' : 'schema_invalid',
        detail: result.detail.slice(0, 300),
      }
    }
    return { ok: true, value: result.value, source: 'ai' }
  }
}
