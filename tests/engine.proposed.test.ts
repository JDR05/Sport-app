// The model gets levers. It does not get past the guardrails.
//
// This file is the reason the AI can be given real creative range at all. Every
// proposal here is either hostile or absurd, and none of them may produce a
// plan that breaks a limit — because a proposed action is an ordinary
// PlannedItem facing the ordinary invariants, and a plan that violates one is
// rejected whole rather than trimmed.
//
// See docs/AI_CAPABILITIES.md for the division of labour these tests pin down:
// the model says what, the engine says when and whether.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { MAX_ITEMS_PER_DAY, MAX_CONSECUTIVE_TRAINING_DAYS } from '@/lib/engine/constants'
import { longestRun } from '@/lib/engine/context'
import { weekdayOf } from '@/lib/engine/dates'
import { WEEKDAYS, type AiProposal, type ProposedAction, type Weekday } from '@/lib/domain/types'
import { ALL_COMBINATIONS, GOALS, makeInput, PROFILES } from './fixtures/profiles'

function action(over: Partial<ProposedAction> = {}): ProposedAction {
  return {
    title: 'Abends zehn Minuten aufräumen',
    reasoning: 'Du hast angegeben, dass dich Unordnung am Abend beschäftigt.',
    domain: 'self_improvement',
    minutes: 10,
    timesPerWeek: 3,
    preferredSlot: 'evening',
    ...over,
  }
}

function proposal(over: Partial<AiProposal> = {}): AiProposal {
  return {
    headline: 'Drei kleine Anker gegen das Aufschieben',
    actions: [action()],
    reasoning: 'Abgeleitet aus deinem Ziel und deinem Tagesablauf.',
    mode: 'augment',
    ...over,
  }
}

describe('a proposal reaches the plan', () => {
  it('adds the proposed actions to the goal track', () => {
    const input = makeInput(PROFILES[3], GOALS[1])
    const before = generatePlan(input)
    const after = generatePlan({ ...input, aiProposal: proposal() })

    expect(after.items.length).toBeGreaterThan(before.items.length)
    const added = after.items.filter((i) => i.details.kind === 'ai_proposed')
    expect(added.length).toBe(3)
    for (const item of added) expect(item.track).toBe('goal')
  })

  it('takes over the goal track when no archetype fits', () => {
    // "general_health" answers an unusual goal with a single action. This is
    // the case the takeover mode exists for.
    const input = makeInput(PROFILES[0], GOALS[6])
    const before = generatePlan(input).items.filter((i) => i.track === 'goal')

    const after = generatePlan({
      ...input,
      aiProposal: proposal({
        mode: 'takeover',
        headline: 'Weniger aufschieben, drei Anker',
        actions: [
          action({ title: 'Abends die eine Hauptaufgabe für morgen festlegen', timesPerWeek: 5 }),
          action({ title: 'Erster Block ohne Telefon im Raum', minutes: 25, timesPerWeek: 4 }),
        ],
      }),
    })
    const goalItems = after.items.filter((i) => i.track === 'goal')

    expect(before.length).toBe(1)
    expect(goalItems.length).toBeGreaterThan(before.length)
    expect(after.strategy.goalTrack.headline).toBe('Weniger aufschieben, drei Anker')
  })

  it('says the reasoning came from the model, traceably', () => {
    const plan = generatePlan({ ...makeInput(PROFILES[3], GOALS[1]), aiProposal: proposal() })
    for (const item of plan.items.filter((i) => i.details.kind === 'ai_proposed')) {
      expect(item.rationale.basedOn).toContain('ai.proposal')
      expect(item.rationale.text.length).toBeGreaterThan(0)
    }
  })
})

describe('a proposal cannot break a safety limit', () => {
  const hostile: Array<[string, AiProposal]> = [
    [
      'floods every day',
      proposal({
        mode: 'takeover',
        actions: Array.from({ length: 5 }, (_, i) =>
          action({ title: `Aktion ${i}`, timesPerWeek: 5, domain: 'training', minutes: 90 }),
        ),
      }),
    ],
    [
      'trains seven days a week',
      proposal({ actions: [action({ domain: 'training', timesPerWeek: 5, minutes: 90 })] }),
    ],
    [
      'asks for very long sessions',
      proposal({ actions: [action({ domain: 'training', minutes: 90, timesPerWeek: 5 })] }),
    ],
    ['proposes zero-minute actions', proposal({ actions: [action({ minutes: 0 })] })],
  ]

  it.each(hostile)('%s — still a valid plan for every profile and goal', (_name, p) => {
    for (const { name, input } of ALL_COMBINATIONS) {
      // generatePlan throws on any violated invariant, so not throwing is the
      // assertion. The named checks below make the important ones explicit.
      const plan = generatePlan({ ...input, aiProposal: p })

      const perDay = new Map<string, number>()
      for (const item of plan.items) {
        perDay.set(item.scheduledOn, (perDay.get(item.scheduledOn) ?? 0) + 1)
      }
      for (const [, count] of perDay) expect(count, name).toBeLessThanOrEqual(MAX_ITEMS_PER_DAY)

      const trainingDays = WEEKDAYS.filter((day) =>
        plan.items.some((i) => i.domain === 'training' && weekdayOf(i.scheduledOn) === day),
      )
      expect(longestRun(trainingDays), name).toBeLessThanOrEqual(MAX_CONSECUTIVE_TRAINING_DAYS)
    }
  })

  it('never schedules onto a day the user excluded', () => {
    const input = {
      ...makeInput(PROFILES[3], GOALS[1]),
      constraints: [
        {
          kind: 'time' as const,
          hard: true,
          value: { type: 'no_training_on' as const, weekdays: ['mon', 'tue', 'wed'] as Weekday[] },
        },
      ],
    }
    const plan = generatePlan({
      ...input,
      constraints: [...input.constraints],
      aiProposal: proposal({
        actions: [action({ domain: 'training', timesPerWeek: 5 })],
      }),
    })

    for (const item of plan.items.filter((i) => i.domain === 'training')) {
      expect(['mon', 'tue', 'wed']).not.toContain(weekdayOf(item.scheduledOn))
    }
  })

  it('respects a learned session cap over the model’s wish', () => {
    const plan = generatePlan({
      ...makeInput(PROFILES[3], GOALS[1]),
      personalRules: [
        { ruleKey: 'shorter_sessions', ruleValue: { maxMinutes: 20 }, confidence: 0.8 },
      ],
      aiProposal: proposal({ actions: [action({ domain: 'training', minutes: 90 })] }),
    })

    for (const item of plan.items.filter((i) => i.details.kind === 'ai_proposed')) {
      expect(item.plannedDurationMin ?? 0).toBeLessThanOrEqual(20)
    }
  })

  it('lets a learned time preference outrank the model’s guess', () => {
    // The rule came from this person's own behaviour; the guess came from a
    // sentence. Behaviour wins — but only where the day actually offers that
    // time, so the schedule here has both a morning and an evening slot.
    const base = makeInput(PROFILES[3], GOALS[1])
    const bothSlots = {
      ...base,
      schedule: {
        ...base.schedule,
        freeSlots: WEEKDAYS.flatMap((weekday) => [
          { weekday, start: '07:00', minutes: 45 },
          { weekday, start: '18:00', minutes: 90 },
        ]),
      },
    }

    const guessed = generatePlan({
      ...bothSlots,
      aiProposal: proposal({ actions: [action({ preferredSlot: 'evening' })] }),
    }).items.filter((i) => i.details.kind === 'ai_proposed')

    const learned = generatePlan({
      ...bothSlots,
      personalRules: [
        { ruleKey: 'prefer_time_slot', ruleValue: { slot: 'early' }, confidence: 0.8 },
      ],
      aiProposal: proposal({ actions: [action({ preferredSlot: 'evening' })] }),
    }).items.filter((i) => i.details.kind === 'ai_proposed')

    // Without a rule the model's wish stands …
    expect(guessed.length).toBeGreaterThan(0)
    expect(guessed.every((i) => i.timeSlot === 'evening')).toBe(true)
    // … with one, it does not.
    expect(learned.length).toBeGreaterThan(0)
    expect(learned.every((i) => i.timeSlot === 'early')).toBe(true)
  })
})

describe('an empty or absent proposal changes nothing', () => {
  it('plans exactly as before', () => {
    for (const { name, input } of ALL_COMBINATIONS) {
      const plain = generatePlan(input)
      for (const empty of [null, undefined, proposal({ actions: [] })]) {
        const withEmpty = generatePlan({ ...input, aiProposal: empty as AiProposal | null })
        expect(withEmpty.items, name).toEqual(plain.items)
      }
    }
  })

  it('falls back to the archetype when a takeover would schedule nothing', () => {
    // Every day excluded means the proposal cannot be placed. A goal with no
    // actions is worse than the thin plan it would have replaced.
    const input = {
      ...makeInput(PROFILES[0], GOALS[6]),
      constraints: [
        {
          kind: 'time' as const,
          hard: true,
          value: { type: 'no_training_on' as const, weekdays: [...WEEKDAYS] },
        },
      ],
    }
    const plan = generatePlan({
      ...input,
      aiProposal: proposal({ mode: 'takeover', actions: [action({ domain: 'training' })] }),
    })
    expect(plan.items.filter((i) => i.track === 'goal').length).toBeGreaterThan(0)
  })
})
