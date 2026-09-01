// The Claude adapter.
//
// Server-side only — the API key must never reach the browser. Every response
// goes through JSON parsing, schema validation and the plausibility checks
// before it is allowed to become a value, and any failure at any stage returns
// a result rather than throwing. The caller then falls back.

import Anthropic from '@anthropic-ai/sdk'
import { goalClassificationSchema, planProposalSchema } from './schemas'
import { checkClassification, checkProposal } from './validate'
import type { AiAdapter, AiConfig, AiResult } from './types'
import type { GoalClassification, PlanProposal } from './schemas'
import type { PlanInput } from '@/lib/domain/types'
import { CLASSIFY_SYSTEM, PROPOSE_SYSTEM } from './prompts'

export class ClaudeAdapter implements AiAdapter {
  readonly name = 'claude'
  private client: Anthropic
  private config: AiConfig

  constructor(config: AiConfig) {
    this.config = config
    this.client = new Anthropic({ apiKey: config.apiKey })
  }

  async classifyGoal(rawText: string): Promise<AiResult<GoalClassification>> {
    return this.call({
      model: this.config.classifyModel,
      // Classification is a small, well-defined task; low effort keeps it cheap
      // and fast without costing accuracy.
      effort: 'low',
      maxTokens: 1500,
      system: CLASSIFY_SYSTEM,
      user: `Ziel des Nutzers: ${rawText.trim().slice(0, 500)}`,
      parse: (json) => {
        const parsed = goalClassificationSchema.safeParse(json)
        if (!parsed.success) return { ok: false as const, detail: parsed.error.message }
        const violations = checkClassification(parsed.data)
        if (violations.length > 0) {
          return { ok: false as const, detail: violations.map((v) => v.rule).join(', '), implausible: true }
        }
        return { ok: true as const, value: parsed.data }
      },
    })
  }

  async proposePlan(input: PlanInput): Promise<AiResult<PlanProposal>> {
    return this.call({
      model: this.config.proposeModel,
      // The hardest thing the model is asked to do, and the one whose quality
      // the user feels most directly.
      effort: 'high',
      maxTokens: 4000,
      system: PROPOSE_SYSTEM,
      user: buildProposalContext(input),
      parse: (json) => {
        const parsed = planProposalSchema.safeParse(json)
        if (!parsed.success) return { ok: false as const, detail: parsed.error.message }
        const violations = checkProposal(parsed.data)
        if (violations.length > 0) {
          return {
            ok: false as const,
            detail: violations.map((v) => v.rule).join(', '),
            implausible: true,
          }
        }
        return { ok: true as const, value: parsed.data }
      },
    })
  }

  private async call<T>(args: {
    model: string
    effort: 'low' | 'high'
    maxTokens: number
    system: string
    user: string
    parse: (json: unknown) => { ok: true; value: T } | { ok: false; detail: string; implausible?: boolean }
  }): Promise<AiResult<T>> {
    if (!this.config.apiKey) {
      return { ok: false, reason: 'no_api_key', detail: 'ANTHROPIC_API_KEY is not set' }
    }

    let response: Anthropic.Message
    try {
      response = await this.client.messages.create(
        {
          model: args.model,
          max_tokens: args.maxTokens,
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
          system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: args.effort },
          messages: [{ role: 'user', content: args.user }],
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

    const result = args.parse(json)
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

/** Models are told not to wrap the JSON, but a fence is the most common slip. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1] : text
}

/**
 * The context a proposal is built from.
 *
 * Deliberately the input only, with no plan attached: for an unusual goal this
 * runs before a plan exists, and for a common one showing the archetype's
 * output would invite the model to restate it rather than add to it.
 *
 * The free slots are described as *how much time*, never as weekdays. If the
 * model saw "Tuesday 19:30" it would propose Tuesdays, and the whole point of
 * the split is that placement is the engine's job.
 */
function buildProposalContext(input: PlanInput): string {
  const p = input.profile
  const slots = input.schedule.freeSlots
  const totalMinutes = slots.reduce((sum, s) => sum + s.minutes, 0)

  return [
    `Ziel in eigenen Worten: ${input.goal.rawText}`,
    `Von der App eingeordnet als: ${input.goal.archetype}`,
    input.goal.targetDate ? `Zieldatum: ${input.goal.targetDate}` : 'Kein Zieldatum genannt.',
    '',
    'Was dieser Mensch angegeben hat:',
    `- Alltag: ${p.sport.experience ?? 'kein Leistungsstand angegeben'}, Arbeitsform ${input.schedule.workPattern ?? 'keine Angabe'}`,
    `- Zeit pro Woche: ${slots.length} freie Zeitfenster, zusammen etwa ${totalMinutes} Minuten`,
    `- Sport: mag ${p.sport.preferredActivities.join(', ') || 'keine Angabe'}; ausgeschlossen: ${p.sport.dislikedActivities.join(', ') || 'nichts'}`,
    `- Ernährung: kocht ${p.nutrition.cooksAtHome ?? 'keine Angabe'}, auswärts ${p.nutrition.eatsOutPerWeek ?? '?'}×/Woche, ${p.nutrition.dietaryPattern ?? 'keine Angabe'}`,
    `- Schlaf: ${p.sleep.usualBedtime ?? '?'} bis ${p.sleep.usualWakeTime ?? '?'}, Qualität ${p.sleep.quality ?? 'keine Angabe'}`,
    `- Kopf: Bildschirmzeit ${p.mind.screenTimeHoursPerDay ?? '?'} h/Tag, Fokus ${p.mind.focusStruggle ?? 'keine Angabe'}`,
    p.mind.existingRoutines.length > 0
      ? `- Bestehende Routinen, an die sich anknüpfen lässt: ${p.mind.existingRoutines.join(', ')}`
      : '- Keine bestehenden Routinen genannt.',
    '',
    'Entwirf zwei bis fünf Aktionen, die genau dieses Ziel bearbeiten. Keine Wochentage, keine Uhrzeiten.',
  ].join('\n')
}
