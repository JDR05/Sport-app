// The Claude adapter.
//
// Server-side only — the API key must never reach the browser. Every response
// goes through JSON parsing, schema validation and the plausibility checks
// before it is allowed to become a value, and any failure at any stage returns
// a result rather than throwing. The caller then falls back.
//
// The prompts, the schemas and the safety gate are not in this file: they are
// in tasks.ts, shared with the OpenAI-compatible adapter, so the free provider
// cannot end up with weaker checks than the paid one.

import Anthropic from '@anthropic-ai/sdk'
import {
  classifyTask, classifyUserMessage, knownFields, proposeTask, proposeUserMessage,
  questionsTask, questionsUserMessage, stripCodeFence,
  weeklyNoteTask, weeklyNoteUserMessage,
  type AiTask, type WeeklyNoteContext,
} from './tasks'
import { logAiFailure } from './log'
import type { AiAdapter, AiConfig, AiResult } from './types'
import type { GoalClassification, IntakeQuestions, PlanProposal, WeeklyNote } from './schemas'
import type { PlanInput } from '@/lib/domain/types'

export class ClaudeAdapter implements AiAdapter {
  readonly name = 'claude'
  private client: Anthropic
  private config: AiConfig

  constructor(config: AiConfig) {
    this.config = config
    this.client = new Anthropic({ apiKey: config.apiKey })
  }

  async classifyGoal(rawText: string): Promise<AiResult<GoalClassification>> {
    return this.call(classifyTask, this.config.classifyModel, classifyUserMessage(rawText))
  }

  async proposePlan(input: PlanInput): Promise<AiResult<PlanProposal>> {
    return this.call(proposeTask, this.config.proposeModel, proposeUserMessage(input))
  }

  async weeklyNote(context: WeeklyNoteContext): Promise<AiResult<WeeklyNote>> {
    return this.call(weeklyNoteTask, this.config.proposeModel, weeklyNoteUserMessage(context))
  }

  async askQuestions(input: PlanInput): Promise<AiResult<IntakeQuestions>> {
    return this.call(
      questionsTask(knownFields(input)),
      this.config.proposeModel,
      questionsUserMessage(input),
    )
  }

  /** Wrapped so every failure is written down once. See log.ts. */
  private async call<T>(task: AiTask<T>, model: string, user: string): Promise<AiResult<T>> {
    const result = await this.attempt(task, model, user)
    if (!result.ok) {
      logAiFailure({
        adapter: this.name,
        task: task.name,
        model,
        reason: result.reason,
        detail: result.detail,
      })
    }
    return result
  }

  private async attempt<T>(
    task: AiTask<T>,
    model: string,
    user: string,
  ): Promise<AiResult<T>> {
    if (!this.config.apiKey) {
      return { ok: false, reason: 'no_api_key', detail: 'ANTHROPIC_API_KEY is not set' }
    }

    let response: Anthropic.Message
    try {
      response = await this.client.messages.create(
        {
          model,
          max_tokens: task.maxTokens,
          // Marked cacheable, and honest about what that is worth here:
          // almost nothing. The app asks the model twice per goal — once to
          // classify it, once to propose actions — and those two calls use
          // different system prompts and are usually minutes or days apart,
          // well past the five-minute cache TTL. The classify prompt is also
          // under the 512-token minimum Opus 5 needs before a prefix caches
          // at all, so that one is inert either way.
          //
          // Left in place because it costs nothing and becomes correct the
          // moment a prompt grows or the call pattern changes. It is not a
          // saving anybody should count on today.
          system: [{ type: 'text', text: task.system, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: task.effort },
          messages: [{ role: 'user', content: user }],
        },
        { timeout: this.config.timeoutMs },
      )
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        return { ok: false, reason: 'timeout', detail: `no response within ${this.config.timeoutMs} ms` }
      }
      if (error instanceof Anthropic.AuthenticationError) {
        return { ok: false, reason: 'no_api_key', detail: 'the configured key was rejected' }
      }
      if (error instanceof Anthropic.APIError) {
        return { ok: false, reason: 'api_error', detail: `${error.status}: ${error.message}` }
      }
      return { ok: false, reason: 'api_error', detail: String(error) }
    }

    // A safety refusal is a normal outcome, not an exception.
    if (response.stop_reason === 'refusal') {
      return { ok: false, reason: 'implausible', detail: 'the model declined the request' }
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

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
