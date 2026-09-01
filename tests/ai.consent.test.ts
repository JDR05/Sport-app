// Consent, tested where it can be tested without a database.
//
// The gate itself — adapterFor reading profiles.ai_consent_at — needs Postgres
// and a session, so it is not in here. What is in here is the property the gate
// rests on: that a refusal produces a working app rather than a broken one.
// If that stopped being true, consent would stop being a free choice, because
// declining would cost the product rather than the model.

import { describe, expect, it } from 'vitest'
import { classifyGoal, providerName, WithheldAdapter } from '@/lib/ai'
import type { AiAdapter } from '@/lib/ai'
import type { PlanInput } from '@/lib/domain/types'

describe('an adapter that was never allowed to run', () => {
  // Held at the interface type on purpose. The class declares its methods
  // without parameters — there is nothing to do with them — and that would
  // otherwise let this test call a narrower signature than the one the app
  // actually calls through.
  const withheld: AiAdapter = new WithheldAdapter()

  it.each(['classifyGoal', 'proposePlan', 'weeklyNote'] as const)('refuses %s', async (task) => {
    // Cast through unknown: two of the three take no argument at all, which is
    // itself the point — the WithheldAdapter cannot use what it is given
    // because it never sends anything.
    const call = withheld[task] as unknown as (
      arg: unknown,
    ) => Promise<{ ok: boolean; reason?: string }>
    const result = await call.call(withheld, {} as PlanInput)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('no_consent')
  })

  it('is distinguishable from a switched-off or unconfigured model', async () => {
    // 'disabled' means somebody turned it off, 'no_api_key' means nobody set it
    // up. Both are for the operator to fix. 'no_consent' is a person's choice
    // being respected, which is not something to fix — so the app can offer the
    // checkbox instead of an apology, and a log line does not read as a fault.
    const result = await withheld.classifyGoal('irgendein Ziel')
    expect(result.ok ? null : result.reason).not.toBe('disabled')
  })
})

describe('the app without permission to use a model', () => {
  it('still classifies the goal, and says where the answer came from', async () => {
    const classified = await classifyGoal('Ich will 10 km am Stück laufen', new WithheldAdapter())

    expect(classified.value.archetype).toBe('endurance')
    expect(classified.source).toBe('fallback')
    expect(classified.fallbackReason).toBe('no_consent')
  })

  it('never leaves the caller without an answer, whatever the goal', async () => {
    // The deterministic classifier must never fail — classifyGoal throws if it
    // does. Consent is only free while this holds.
    for (const text of ['abnehmen', 'weniger am Handy', 'ᕕ( ᐛ )ᕗ', 'x'.repeat(400)]) {
      const classified = await classifyGoal(text, new WithheldAdapter())
      expect(classified.value.restated.length).toBeGreaterThan(0)
    }
  })
})

describe('who the consent text names', () => {
  it.each([
    ['https://generativelanguage.googleapis.com/v1beta/openai/', 'Google (Gemini)'],
    ['https://api.groq.com/openai/v1', 'Groq'],
    ['https://openrouter.ai/api/v1', 'OpenRouter'],
    ['https://api.mistral.ai/v1', 'Mistral AI'],
  ])('names the company behind %s', (baseUrl, expected) => {
    expect(
      providerName({
        AI_COMPAT_BASE_URL: baseUrl,
        AI_COMPAT_KEY: 'k',
        AI_COMPAT_MODEL: 'm',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(expected)
  })

  it('falls back to the hostname rather than inventing a name', () => {
    // Better a bare domain than a friendly label for a provider nobody listed:
    // the sentence has to name the actual recipient to be informed consent.
    expect(
      providerName({
        AI_COMPAT_BASE_URL: 'https://llm.example.org/v1',
        AI_COMPAT_KEY: 'k',
        AI_COMPAT_MODEL: 'm',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe('llm.example.org')
  })

  it.each([
    ['nothing configured at all', {}],
    ['a base URL with no key', { AI_COMPAT_BASE_URL: 'https://api.groq.com/openai/v1' }],
    ['a key with no model', { AI_COMPAT_BASE_URL: 'https://api.groq.com', AI_COMPAT_KEY: 'k' }],
    ['the model switched off', { AI_ADAPTER: 'null', ANTHROPIC_API_KEY: 'sk-x' }],
    ['the deterministic adapter forced', { AI_ADAPTER: 'mock', ANTHROPIC_API_KEY: 'sk-x' }],
  ])('names nobody when there is %s', (_case, env) => {
    // Null is what hides the checkbox. Asking somebody to agree to a transfer
    // that cannot happen is consent theatre, and the sentence would have a
    // hole where the recipient goes.
    expect(providerName(env as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it('names Anthropic when a Claude key is what is configured', () => {
    expect(providerName({ ANTHROPIC_API_KEY: 'sk-ant-x' } as unknown as NodeJS.ProcessEnv)).toBe(
      'Anthropic (Claude)',
    )
  })

  it('names the compatible provider when AI_ADAPTER forces it past a Claude key', () => {
    // createAdapter honours AI_ADAPTER=compat over the Anthropic key, so the
    // consent text has to say the same thing the request will do.
    expect(
      providerName({
        AI_ADAPTER: 'compat',
        ANTHROPIC_API_KEY: 'sk-ant-x',
        AI_COMPAT_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        AI_COMPAT_KEY: 'k',
        AI_COMPAT_MODEL: 'm',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe('Google (Gemini)')
  })
})
