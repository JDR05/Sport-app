// The gate in front of the levers.
//
// A proposal becomes something a person is asked to do every week, so it is
// held to a stricter standard than a piece of advice they can ignore. What is
// checked here is what stands between a model's bad day and somebody's plan.

import { describe, expect, it } from 'vitest'
import { checkProposal, planProposalSchema, MockAdapter, NullAdapter, proposePlan } from '@/lib/ai'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'

function proposal(over: Partial<Record<string, unknown>> = {}) {
  return {
    headline: 'Drei Anker gegen das Aufschieben',
    reasoning: 'Abgeleitet aus deinem Tagesablauf und deiner Bildschirmzeit.',
    metricKey: null,
    metricLabel: null,
    unit: null,
    actions: [
      {
        title: 'Abends die eine Hauptaufgabe für morgen festlegen',
        reasoning: 'Du hast angegeben, dass dir der Start in den Tag schwerfällt.',
        domain: 'self_improvement',
        minutes: 5,
        timesPerWeek: 5,
        preferredSlot: 'evening',
      },
    ],
    ...over,
  }
}

describe('the schema', () => {
  it('accepts a well-formed proposal', () => {
    expect(planProposalSchema.safeParse(proposal()).success).toBe(true)
  })

  it.each([
    ['no actions at all', { actions: [] }],
    ['more actions than a week holds', { actions: Array.from({ length: 9 }, () => proposal().actions[0]) }],
    ['a session longer than the cap', { actions: [{ ...proposal().actions[0], minutes: 500 }] }],
    ['a daily obligation', { actions: [{ ...proposal().actions[0], timesPerWeek: 7 }] }],
    ['an unknown domain', { actions: [{ ...proposal().actions[0], domain: 'finance' }] }],
    ['a made-up slot', { actions: [{ ...proposal().actions[0], preferredSlot: 'nachts' }] }],
    ['no reasoning', { actions: [{ ...proposal().actions[0], reasoning: 'kurz' }] }],
  ])('refuses %s', (_name, over) => {
    expect(planProposalSchema.safeParse(proposal(over)).success).toBe(false)
  })

  it('has nowhere to put a date', () => {
    // The model must not schedule. If it tries, the field is simply not part of
    // the parsed value — placement stays the engine's job.
    const withDate = planProposalSchema.parse(
      proposal({ actions: [{ ...proposal().actions[0], scheduledOn: '2026-08-24', weekday: 'mon' }] }),
    )
    expect(withDate.actions[0]).not.toHaveProperty('scheduledOn')
    expect(withDate.actions[0]).not.toHaveProperty('weekday')
  })
})

describe('plausibility', () => {
  it('passes a sound proposal', () => {
    expect(checkProposal(proposal() as never)).toEqual([])
  })

  it.each([
    ['restriction framing', 'Verzichte abends komplett auf dein Handy'],
    ['a calorie number', 'Iss höchstens 1400 kcal am Tag'],
    ['less sleep', 'Steh eine Stunde früher auf und schlafe kürzer'],
    ['a medical claim', 'Das heilt deine Rückenschmerzen zuverlässig'],
  ])('rejects %s', (_name, title) => {
    const violations = checkProposal(
      proposal({ actions: [{ ...proposal().actions[0], title }] }) as never,
    )
    expect(violations.length).toBeGreaterThan(0)
  })

  it('rejects an effort nobody sustains weekly', () => {
    const violations = checkProposal(
      proposal({ actions: [{ ...proposal().actions[0], minutes: 80 }] }) as never,
    )
    expect(violations.some((v) => v.rule === 'realistic_effort')).toBe(true)
  })

  it('scans the headline too, not only the actions', () => {
    const violations = checkProposal(
      proposal({ headline: 'Streiche Kohlenhydrate komplett' }) as never,
    )
    expect(violations.length).toBeGreaterThan(0)
  })
})

describe('without a model', () => {
  const input = makeInput(PROFILES[0], GOALS[6])

  it('proposes nothing rather than inventing a fixed list', () => {
    // Sorting a sentence into seven buckets is something a word list can
    // genuinely do. Inventing plan actions is not — a deterministic stand-in
    // would be a canned list dressed up as personalisation.
    return proposePlan(input, new MockAdapter()).then((result) => {
      expect(result.proposal).toBeNull()
      expect(result.source).toBe('none')
      expect(result.reason).toBe('no_api_key')
    })
  })

  it('says the same when AI is switched off entirely', async () => {
    const result = await proposePlan(input, new NullAdapter())
    expect(result.proposal).toBeNull()
    expect(result.reason).toBe('disabled')
  })

  it('never throws, whatever the adapter does', async () => {
    const exploding = {
      name: 'boom',
      usesModel: true,
      classifyGoal: async () => {
        throw new Error('nope')
      },
      weeklyNote: async () => {
        throw new Error('nope')
      },
      askQuestions: async () => {
        throw new Error('nope')
      },
      ask: async () => {
        throw new Error('nope')
      },
      followUp: async () => {
        throw new Error('nope')
      },
      judgeCommitments: async () => {
        throw new Error('nope')
      },
      // Throws, like the other three. The point of the fixture is a throwing
      // adapter, and this was the one method the assertion actually called —
      // so it returned a value and the test passed without exercising a throw
      // at all.
      proposePlan: async () => {
        throw new Error('nope')
      },
    }
    await expect(proposePlan(input, exploding)).resolves.toMatchObject({ proposal: null })
  })
})
