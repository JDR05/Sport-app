// The free provider gets the same gate as the paid one.
//
// That is the entire risk of this adapter. A cheaper model produces
// restrictive phrasing, invented calorie numbers and "sleep less to train
// earlier" *more* often than Claude does, not less — so the one thing that
// must not differ between the two adapters is what happens between "the model
// said something" and "the app believes it".
//
// Every failure below ends in the deterministic path. None of them throws, and
// none of them reaches a screen.

import { describe, expect, it } from 'vitest'
import { OpenAiCompatibleAdapter, readCompatibleConfig, type CompatibleConfig } from '@/lib/ai'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'

const config: CompatibleConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  classifyModel: 'small',
  proposeModel: 'big',
  timeoutMs: 1000,
  label: 'testprovider',
}

/** A fetch that answers with whatever the provider is pretending to say. */
function answering(content: string, init: { status?: number; finishReason?: string } = {}) {
  return async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: init.finishReason ?? 'stop' }],
      }),
      { status: init.status ?? 200, headers: { 'content-type': 'application/json' } },
    )
}

const valid = JSON.stringify({
  archetype: 'sleep_recovery',
  confidence: 0.9,
  metricKey: 'sleep_hours',
  unit: 'h',
  restated: 'Besser schlafen und ausgeruhter aufwachen',
  reasoning: 'Der Nutzer nennt Schlaf als Kern des Ziels.',
})

describe('a provider that answers correctly', () => {
  it('is accepted', async () => {
    const adapter = new OpenAiCompatibleAdapter(config, answering(valid) as typeof fetch)
    const result = await adapter.classifyGoal('Ich will besser schlafen')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.archetype).toBe('sleep_recovery')
  })

  it('survives the code fence models keep adding', async () => {
    const fenced = '```json\n' + valid + '\n```'
    const adapter = new OpenAiCompatibleAdapter(config, answering(fenced) as typeof fetch)
    expect((await adapter.classifyGoal('schlafen')).ok).toBe(true)
  })
})

describe('a provider that answers badly', () => {
  const cases: Array<[string, string, string]> = [
    ['prose instead of JSON', 'Klar! Hier ist meine Einschätzung:', 'invalid_json'],
    ['JSON of the wrong shape', '{"foo":"bar"}', 'schema_invalid'],
    ['an unknown archetype', '{"archetype":"productivity","confidence":0.9,"metricKey":null,"unit":null,"restated":"Mehr schaffen","reasoning":"Ein Grund der lang genug ist."}', 'schema_invalid'],
  ]

  it.each(cases)('reports %s as %s', async (_name, content, reason) => {
    const adapter = new OpenAiCompatibleAdapter(config, answering(content) as typeof fetch)
    const result = await adapter.classifyGoal('egal')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it('refuses a plan that tells someone to sleep less', async () => {
    // The safety gate, on the cheap provider. checkProposal is shared with the
    // Claude adapter, which is the point of tasks.ts — this asserts the free
    // path actually goes through it.
    //
    // Schema-valid on purpose: a payload that fails the shape check would be
    // rejected one step earlier and prove nothing about the safety rules. The
    // first version of this test did exactly that and passed for the wrong
    // reason.
    const unsafe = JSON.stringify({
      headline: 'Mehr Training diese Woche',
      reasoning: 'Du hast angegeben, morgens Zeit zu haben und trainieren zu wollen.',
      metricKey: null,
      metricLabel: null,
      unit: null,
      actions: [
        {
          title: 'Früher aufstehen zum Laufen',
          reasoning: 'Steh eine Stunde früher auf um zu trainieren, dafür etwas weniger Schlaf.',
          domain: 'training',
          minutes: 30,
          timesPerWeek: 3,
          preferredSlot: 'early',
        },
      ],
    })
    const adapter = new OpenAiCompatibleAdapter(config, answering(unsafe) as typeof fetch)
    const result = await adapter.proposePlan(makeInput(PROFILES[0], GOALS[3]))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('implausible')
  })

  it('refuses a plan that tells someone what to cut out', async () => {
    const restrictive = JSON.stringify({
      headline: 'Diese Woche verzichtest du auf Zucker',
      reasoning: 'Du hast angegeben, abends oft zu naschen, deshalb dieser Vorschlag.',
      metricKey: null,
      metricLabel: null,
      unit: null,
      actions: [
        {
          title: 'Abends nichts mehr essen',
          reasoning: 'Du hast angegeben, abends oft zu naschen, also streiche das Abendessen.',
          domain: 'nutrition',
          minutes: 0,
          timesPerWeek: 5,
          preferredSlot: 'evening',
        },
      ],
    })
    const adapter = new OpenAiCompatibleAdapter(config, answering(restrictive) as typeof fetch)
    const result = await adapter.proposePlan(makeInput(PROFILES[0], GOALS[0]))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('implausible')
  })
})

describe('a provider that is having a bad day', () => {
  it('tells a rejected key apart from an outage', async () => {
    // One of these never fixes itself, so they must not look the same.
    const unauthorised = new OpenAiCompatibleAdapter(config, (async () =>
      new Response('nope', { status: 401 })) as typeof fetch)
    const down = new OpenAiCompatibleAdapter(config, (async () =>
      new Response('oops', { status: 503 })) as typeof fetch)

    const a = await unauthorised.classifyGoal('x')
    const b = await down.classifyGoal('x')
    expect(a.ok === false && a.reason).toBe('no_api_key')
    expect(b.ok === false && b.reason).toBe('api_error')
  })

  it('recognises a rejected key even when it arrives as a 400', async () => {
    // Found by pointing the check script at Gemini with a deliberately wrong
    // key: its OpenAI-compatible endpoint answers 400 "Please pass a valid API
    // key" rather than 401. Without this, a mistyped key looked like a
    // transient outage — something the app would keep retrying for ever.
    const gemini = new OpenAiCompatibleAdapter(config, (async () =>
      new Response(
        JSON.stringify({ error: { code: 400, message: 'Please pass a valid API key' } }),
        { status: 400 },
      )) as typeof fetch)

    const result = await gemini.classifyGoal('x')
    expect(result.ok === false && result.reason).toBe('no_api_key')
  })

  it('still calls an ordinary bad request a bad request', async () => {
    // The body test has to stay narrow: a 400 about a parameter is not a key
    // problem, and calling it one would send someone hunting the wrong thing.
    const badParam = new OpenAiCompatibleAdapter(config, (async () =>
      new Response(
        JSON.stringify({ error: { message: 'Unknown field: response_format' } }),
        { status: 400 },
      )) as typeof fetch)

    const result = await badParam.classifyGoal('x')
    expect(result.ok === false && result.reason).toBe('api_error')
  })

  it('reports a rate limit as an ordinary failure, not a crash', async () => {
    // The one every free tier hits. It must fall back, quietly.
    const limited = new OpenAiCompatibleAdapter(config, (async () =>
      new Response('rate limit exceeded', { status: 429 })) as typeof fetch)
    const result = await limited.classifyGoal('x')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('api_error')
  })

  it('gives up rather than hanging', async () => {
    const never = new OpenAiCompatibleAdapter(
      { ...config, timeoutMs: 30 },
      ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            reject(e)
          })
        })) as unknown as typeof fetch,
    )
    const result = await never.classifyGoal('x')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('timeout')
  })

  it('never throws, whatever comes back', async () => {
    const broken = new OpenAiCompatibleAdapter(config, (async () => {
      throw new Error('DNS exploded')
    }) as typeof fetch)
    await expect(broken.classifyGoal('x')).resolves.toMatchObject({ ok: false })
  })

  it('treats a content filter as a refusal, not as broken JSON', async () => {
    const filtered = new OpenAiCompatibleAdapter(
      config,
      answering('', { finishReason: 'content_filter' }) as typeof fetch,
    )
    const result = await filtered.classifyGoal('x')
    expect(result.ok === false && result.reason).toBe('implausible')
  })
})

describe('half a configuration is no configuration', () => {
  it.each([
    ['nothing at all', {}],
    ['a URL without a key', { AI_COMPAT_BASE_URL: 'https://x.test/v1', AI_COMPAT_MODEL: 'm' }],
    ['a key without a URL', { AI_COMPAT_KEY: 'k', AI_COMPAT_MODEL: 'm' }],
    ['no model named', { AI_COMPAT_BASE_URL: 'https://x.test/v1', AI_COMPAT_KEY: 'k' }],
  ])('refuses to call anything with %s', (_name, env) => {
    // Guessing here would mean every request failing against an endpoint
    // nobody meant to configure.
    expect(readCompatibleConfig(env as unknown as NodeJS.ProcessEnv, 1000)).toBeNull()
  })

  it('uses one model for both jobs unless a second is named', () => {
    const one = readCompatibleConfig(
      { AI_COMPAT_BASE_URL: 'https://x.test/v1', AI_COMPAT_KEY: 'k', AI_COMPAT_MODEL: 'm' } as unknown as NodeJS.ProcessEnv,
      1000,
    )
    expect(one?.classifyModel).toBe('m')
    expect(one?.proposeModel).toBe('m')
  })
})

describe('a failure that leaves a trace', () => {
  // The reason this exists. When the model stopped working in production the
  // screen said "the model gave nothing", the request returned 200 in under a
  // second, and the log was empty — so a wrong key, a wrong model name and a
  // refused answer were indistinguishable from the outside. A subsystem that
  // cannot fail loudly cannot be fixed.

  /** Captures console.warn for one call and always restores it. */
  async function warningsFrom(run: () => Promise<unknown>): Promise<string[]> {
    const lines: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
    try {
      await run()
    } finally {
      console.warn = original
    }
    return lines
  }

  it.each([
    ['a rejected key', { status: 401, body: 'invalid api key' }],
    ['an unknown model', { status: 404, body: 'models/wrong-name is not found' }],
    ['a provider outage', { status: 503, body: 'service unavailable' }],
  ])('writes one line for %s', async (_case, provider) => {
    const adapter = new OpenAiCompatibleAdapter(config, async () =>
      new Response(provider.body, { status: provider.status }),
    )

    const lines = await warningsFrom(() => adapter.classifyGoal('Ich will besser schlafen'))

    expect(lines).toHaveLength(1)
    // The provider's own words, because the reason alone does not separate a
    // wrong key from a wrong model name — both look like one 4xx.
    expect(lines[0]).toContain(provider.body)
    expect(lines[0]).toContain('classify')
  })

  it('names the task, so it is clear which of the four calls broke', async () => {
    const adapter = new OpenAiCompatibleAdapter(config, async () =>
      new Response('nope', { status: 500 }),
    )

    const lines = await warningsFrom(() =>
      adapter.askQuestions(makeInput(PROFILES[0], GOALS[0])),
    )
    expect(lines[0]).toContain('questions')
  })

  it('never writes the key or the prompt', async () => {
    // The prompt is somebody's goal, sleep and eating habits. A log line is
    // exactly the wrong place for it, and the key must not be anywhere at all.
    const adapter = new OpenAiCompatibleAdapter(config, async () =>
      new Response('bad request', { status: 400 }),
    )

    const lines = await warningsFrom(() =>
      adapter.proposePlan(makeInput(PROFILES[0], GOALS[0])),
    )

    expect(lines[0]).not.toContain(config.apiKey)
    expect(lines[0]).not.toContain('Ziel in eigenen Worten')
  })

  it('stays quiet when the call worked', async () => {
    const adapter = new OpenAiCompatibleAdapter(config, answering(valid))
    const lines = await warningsFrom(() => adapter.classifyGoal('Ich will besser schlafen'))
    expect(lines).toEqual([])
  })
})

describe('a provider that answers and then goes quiet', () => {
  // The timeout used to be disarmed the moment headers arrived. A provider
  // could answer 200 and never finish sending the body — ordinary on a
  // degraded free tier — and `await response.text()` would then wait with
  // nothing left to interrupt it. The documented `timeout` never fired and the
  // page load simply hung, which is the failure mode this whole layer exists
  // to make impossible.
  // Ties the body stream to the abort signal, because that is what real fetch
  // does — and a stub that ignores the signal tests the stub, not the adapter.
  // The first version of this stub did exactly that and hung for five seconds
  // against a fix that works.
  const stalling: typeof fetch = async (_url, init) =>
    new Response(
      new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')))
        },
      }),
      { status: 200 },
    )

  it('gives up on a stalled body instead of waiting for ever', async () => {
    const adapter = new OpenAiCompatibleAdapter({ ...config, timeoutMs: 300 }, stalling)

    const began = Date.now()
    const result = await adapter.classifyGoal('Ich will besser schlafen')
    const took = Date.now() - began

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toBe('timeout')
    // Generous, because the assertion is "bounded", not "fast". Before the fix
    // this never resolved at all.
    expect(took).toBeLessThan(5_000)
  })

  it('says the body stalled, not that the provider never answered', async () => {
    // Two different faults with two different fixes: nothing arrived at all
    // versus headers arrived and the stream stopped. A log that cannot tell
    // them apart sends somebody to check the wrong thing.
    const adapter = new OpenAiCompatibleAdapter({ ...config, timeoutMs: 300 }, stalling)
    const result = await adapter.classifyGoal('Ich will besser schlafen')
    expect(result.ok ? '' : result.detail).toContain('stalled')
  })
})
