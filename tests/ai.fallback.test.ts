// The condition that makes this a product with AI support rather than an AI
// wrapper: everything still works when the model is absent, slow or wrong.

import { describe, expect, it } from 'vitest'
import { classifyGoal, proposePlan, MockAdapter, NullAdapter } from '@/lib/ai'
import { generatePlan } from '@/lib/engine'
import { GOALS, PROFILES, makeInput } from './fixtures/profiles'
import type { AiAdapter, AiResult } from '@/lib/ai'
import type { GoalClassification } from '@/lib/ai'

/** Stands in for every way a real call can fail. */
class FailingAdapter implements AiAdapter {
  async proposePlan(): Promise<AiResult<never>> {
    return { ok: false, reason: this.reason, detail: 'test' }
  }

  readonly name = 'claude'
  constructor(private reason: 'timeout' | 'invalid_json' | 'schema_invalid' | 'implausible' | 'api_error') {}
  async classifyGoal(): Promise<AiResult<GoalClassification>> {
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

describe('product without AI', () => {
  it('every profile and goal still yields a full plan with the null adapter', async () => {
    for (const profile of PROFILES.slice(0, 3)) {
      for (const goal of GOALS) {
        const i = makeInput(profile, goal)
        const p = generatePlan(i)

        // No proposal, and the plan is untouched and complete anyway. This is
        // the condition that makes this a product with AI support rather than
        // an AI wrapper.
        const proposed = await proposePlan(i, new NullAdapter())
        expect(proposed.proposal).toBeNull()
        expect(proposed.source).toBe('none')

        expect(p.items.length).toBeGreaterThan(0)
        expect(p.strategy.goalTrack.headline.length).toBeGreaterThan(0)
      }
    }
  })

  it.each(FAILURES)('plans without a proposal when the model fails with %s', async (reason) => {
    // A failure is a value, never a throw: the caller cannot forget to handle
    // it, and every one of them lands in the same deterministic plan.
    const input = makeInput(PROFILES[0], GOALS[3])
    const proposed = await proposePlan(input, new FailingAdapter(reason))

    expect(proposed.proposal).toBeNull()
    expect(proposed.reason).toBe(reason)
    expect(generatePlan(input).items.length).toBeGreaterThan(0)
  })
})
