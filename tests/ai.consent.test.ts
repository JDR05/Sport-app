// Consent, tested where it can be tested without a database.
//
// The gate itself — adapterFor reading profiles.ai_consent_at — needs Postgres
// and a session, so it is not in here. What is in here is the property the gate
// rests on: that a refusal produces a working app rather than a broken one.
// If that stopped being true, consent would stop being a free choice, because
// declining would cost the product rather than the model.

import { describe, expect, it } from 'vitest'
import {
  classifyGoal, createAdapter, MockAdapter, proposePlan, providerLearnsFromData, providerName,
  readConfig, timeoutFrom,
  WithheldAdapter,
} from '@/lib/ai'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
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

describe('a timeout a typo cannot break', () => {
  // The bug this pins down cost an afternoon and looked like the provider's
  // fault. AI_TIMEOUT_MS existed but was empty, `??` does not catch an empty
  // string, Number('') is 0, and AbortController then cancelled every request
  // before it left the machine — reported as `timeout`, the one reason that
  // says "try again" rather than "your configuration is wrong".

  const quiet = async (run: () => void) => {
    const original = console.warn
    console.warn = () => {}
    try {
      run()
    } finally {
      console.warn = original
    }
  }

  it.each([
    ['an empty value', ''],
    ['a value with a unit', '20s'],
    ['a word', 'default'],
    ['zero', '0'],
    ['a negative number', '-1'],
  ])('falls back to the default for %s', async (_case, value) => {
    await quiet(() => {
      const config = readConfig({ AI_TIMEOUT_MS: value } as unknown as NodeJS.ProcessEnv)
      expect(config.timeoutMs).toBe(20_000)
    })
  })

  it('still honours a real value', () => {
    const config = readConfig({ AI_TIMEOUT_MS: '5000' } as unknown as NodeJS.ProcessEnv)
    expect(config.timeoutMs).toBe(5_000)
  })

  it('uses the default when nothing is configured', () => {
    expect(readConfig({} as unknown as NodeJS.ProcessEnv).timeoutMs).toBe(20_000)
  })

  it('says which value it refused, so it is findable', async () => {
    const lines: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
    try {
      timeoutFrom('20s', 20_000)
    } finally {
      console.warn = original
    }
    expect(lines[0]).toContain('AI_TIMEOUT_MS')
    expect(lines[0]).toContain('20s')
  })

  it.each([
    ['NaN', Number.NaN],
    ['zero', 0],
    ['a negative budget', -5],
  ])('cannot be broken through the per-call override either: %s', async (_case, budget) => {
    // askIntakeQuestions and the week-load path both pass their own budget, so
    // the override is a second way in. A caller computing one badly must not be
    // able to switch the model off — which is exactly what a 0 does.
    await quiet(() => expect(timeoutFrom(budget, 20_000)).toBe(20_000))
  })

  it('still creates a working adapter when a caller passes a broken budget', async () => {
    await quiet(() => {
      const adapter = createAdapter(
        {
          AI_COMPAT_BASE_URL: 'https://api.groq.com/openai/v1',
          AI_COMPAT_KEY: 'k',
          AI_COMPAT_MODEL: 'm',
        } as unknown as NodeJS.ProcessEnv,
        Number.NaN,
      )
      // Not the deterministic fallback: a bad number must not silently
      // downgrade the app to the no-model path either.
      expect(adapter.name).toBe('compatible')
    })
  })
})

describe('who counts as having used the model', () => {
  // The bug: `source` was decided by `primary.name === 'claude'`, written when
  // Claude was the only real adapter. The compatible adapter names itself after
  // the provider, so a *successful* Gemini classification was reported as a
  // fallback — the goal stayed marked 'keywords' in the database, and the app
  // told the person it had not used the model it had just used.

  const answering = (): AiAdapter => ({
    name: 'gemini',
    usesModel: true,
    classifyGoal: async () => ({
      ok: true as const,
      source: 'ai' as const,
      value: {
        archetype: 'endurance',
        confidence: 0.9,
        metricKey: 'distance_km',
        unit: 'km',
        restated: 'Zehn Kilometer am Stück laufen',
        reasoning: 'Der Zieltext nennt eine Laufdistanz.',
      },
    }),
    proposePlan: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    weeklyNote: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    askQuestions: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    ask: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    followUp: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    judgeCommitments: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
  })

  it('credits a provider that is not Claude', async () => {
    const classified = await classifyGoal('Ich will 10 km laufen', answering())
    expect(classified.source).toBe('ai')
  })

  it('still does not credit the word list, which also succeeds', async () => {
    // MockAdapter.classifyGoal returns ok:true — a keyword match is a real
    // answer. It is just not the model, and the screen says which one the
    // person is looking at.
    const classified = await classifyGoal('Ich will 10 km laufen', new MockAdapter())
    expect(classified.source).toBe('fallback')
  })
})

describe('the never-throws contract, enforced rather than trusted', () => {
  // AiResult says a failed call is a value so no call site can forget to
  // handle one. Nothing enforced that at the boundary, so the promise held
  // only while every adapter stayed internally disciplined — and an adapter
  // that throws takes the screen down with it, which is the one thing this
  // design exists to prevent.
  const throwing: AiAdapter = {
    name: 'broken',
    usesModel: true,
    classifyGoal: async () => {
      throw new Error('boom')
    },
    proposePlan: async () => {
      throw new Error('boom')
    },
    weeklyNote: async () => {
      throw new Error('boom')
    },
    askQuestions: async () => {
      throw new Error('boom')
    },
    ask: async () => {
      throw new Error('boom')
    },
    followUp: async () => {
      throw new Error('boom')
    },
    judgeCommitments: async () => {
      throw new Error('boom')
    },
  }

  it('still classifies when the adapter throws', async () => {
    const classified = await classifyGoal('Ich will 10 km laufen', throwing)
    expect(classified.value.archetype).toBe('endurance')
    expect(classified.source).toBe('fallback')
  })

  it('still returns a value when proposePlan throws', async () => {
    const { proposal, source } = await proposePlan(makeInput(PROFILES[0], GOALS[0]), throwing)
    expect(proposal).toBeNull()
    expect(source).toBe('none')
  })
})

describe('an answer the model itself does not believe', () => {
  const sure = (confidence: number): AiAdapter => ({
    name: 'gemini',
    usesModel: true,
    classifyGoal: async () => ({
      ok: true as const,
      source: 'ai' as const,
      value: {
        archetype: 'sleep_recovery',
        confidence,
        metricKey: 'sleep_hours',
        unit: 'h',
        restated: 'Besser schlafen',
        reasoning: 'Der Zieltext nennt Schlaf.',
      },
    }),
    proposePlan: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    weeklyNote: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    askQuestions: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    ask: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    followUp: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
    judgeCommitments: async () => ({ ok: false as const, reason: 'api_error' as const, detail: 'x' }),
  })

  it('does not run the gate against the deterministic classifier', async () => {
    // classifyGoalText reports 0.2 when no keyword matched, which is the
    // product's ordinary general_health case. Running that through the gate
    // told people the answer had failed a safety check when nothing had been
    // sent anywhere at all.
    const classified = await classifyGoal('Ich will einfach ausgeglichener sein', new MockAdapter())
    expect(classified.value.archetype).toBe('general_health')
    expect(classified.fallbackReason).toBeUndefined()
  })

  it('names low confidence as itself, not as a failed safety check', async () => {
    // 'implausible' means the answer was refused by checkClassification.
    // A model being honest about an ambiguous goal — which CLASSIFY_SYSTEM
    // explicitly asks for — is not that, and the two need different words
    // because they need different responses from the person reading them.
    const classified = await classifyGoal('irgendwas mit Gesundheit', sure(0.05))
    expect(classified.fallbackReason).toBe('low_confidence')
  })

  it('falls back when the model reports low confidence', async () => {
    // The schema has documented this since it was written and nothing read the
    // field, so a model answering 0.05 was adopted and stored as
    // model-classified. The archetype decides which safety limits apply — a
    // coin flip is worse than the word list, which is at least reproducible.
    const classified = await classifyGoal('irgendwas mit Gesundheit', sure(0.05))
    expect(classified.source).toBe('fallback')
    expect(classified.fallbackDetail).toContain('confidence')
  })

  it('accepts it when the model is sure', async () => {
    const classified = await classifyGoal('Ich will besser schlafen', sure(0.9))
    expect(classified.source).toBe('ai')
    expect(classified.value.archetype).toBe('sleep_recovery')
  })
})

describe('which tier the consent text describes', () => {
  it.each([
    ['nothing configured', {}],
    ['an empty value', { AI_COMPAT_TRAINS: '' }],
    ['a word nobody planned for', { AI_COMPAT_TRAINS: 'vielleicht' }],
  ])('assumes the provider learns from the data when %s', (_case, env) => {
    // A missing variable must not be able to under-warn. Somebody who has not
    // thought about it yet is on a free tier, and free tiers generally do
    // learn from what they are given — so silence defaults to the warning,
    // never away from it.
    expect(providerLearnsFromData(env as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it.each(['false', 'FALSE', 'no', '0'])('accepts %s as a deliberate opt-out', (value) => {
    expect(
      providerLearnsFromData({ AI_COMPAT_TRAINS: value } as unknown as NodeJS.ProcessEnv),
    ).toBe(false)
  })
})
