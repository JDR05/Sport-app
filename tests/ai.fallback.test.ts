// The condition that makes this a product with AI support rather than an AI
// wrapper: everything still works when the model is absent, slow or wrong.

import { describe, expect, it } from 'vitest'
import { classifyGoal, suggest, MockAdapter, NullAdapter } from '@/lib/ai'
import { generatePlan } from '@/lib/engine'
import { GOALS, PROFILES, makeInput } from './fixtures/profiles'
import type { AiAdapter, AiResult } from '@/lib/ai'
import type { GoalClassification, Suggestions } from '@/lib/ai'

/** Stands in for every way a real call can fail. */
class FailingAdapter implements AiAdapter {
  readonly name = 'claude'
  constructor(private reason: 'timeout' | 'invalid_json' | 'schema_invalid' | 'implausible' | 'api_error') {}
  async classifyGoal(): Promise<AiResult<GoalClassification>> {
    return { ok: false, reason: this.reason, detail: 'simulated' }
  }
  async suggest(): Promise<AiResult<Suggestions>> {
    return { ok: false, reason: this.reason, detail: 'simulated' }
  }
}

const FAILURES = ['timeout', 'invalid_json', 'schema_invalid', 'implausible', 'api_error'] as const

describe('classification fallback', () => {
  it.each(FAILURES)('still classifies when the model fails with %s', async (reason) => {
    const result = await classifyGoal('Ich will endlich besser schlafen', new FailingAdapter(reason))
    expect(result.source).toBe('fallback')
    expect(result.fallbackReason).toBe(reason)
    expect(result.value.archetype).toBe('sleep_recovery')
  })

  it('reports the deterministic source honestly when no key is configured', async () => {
    const result = await classifyGoal('10 km am Stück laufen', new MockAdapter())
    expect(result.source).toBe('fallback')
    expect(result.value.archetype).toBe('endurance')
  })

  it('never returns an empty restatement', async () => {
    const result = await classifyGoal('abc', new MockAdapter())
    expect(result.value.restated.length).toBeGreaterThan(0)
  })
})

describe('suggestion fallback', () => {
  const input = makeInput(PROFILES[0], GOALS[3])
  const plan = generatePlan(input)

  it.each(FAILURES)('falls back to deterministic suggestions on %s', async (reason) => {
    const result = await suggest(input, plan, new FailingAdapter(reason))
    expect(result.source).toBe('fallback')
    expect(result.value?.suggestions.length).toBeGreaterThan(0)
  })

  it('returns nothing rather than filler when AI is switched off', async () => {
    const result = await suggest(input, plan, new NullAdapter())
    expect(result.source).toBe('none')
    expect(result.value).toBeNull()
  })
})

describe('product without AI', () => {
  it('every profile and goal still yields a full plan with the null adapter', async () => {
    for (const profile of PROFILES.slice(0, 3)) {
      for (const goal of GOALS) {
        const i = makeInput(profile, goal)
        const p = generatePlan(i)
        expect(p.items.length).toBeGreaterThan(0)
        const s = await suggest(i, p, new NullAdapter())
        // No suggestions, but the plan itself is untouched and complete.
        expect(s.value).toBeNull()
        expect(p.strategy.goalTrack.headline.length).toBeGreaterThan(0)
      }
    }
  })
})
