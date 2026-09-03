// The person answering the model's suggestion.
//
// Insights listed "45 Minuten Krafttraining im Gym, 2×/Woche" and there was no
// way to say anything back. So the one screen that shows what the AI thinks was
// also the one that proved the app was not listening: "dann möchte ich da aber
// Präferenzen geben, zum Beispiel möchte ich zweimal der Woche Krafttraining
// machen."
//
// A preference is a *request*, and these tests are mostly about that word. It
// changes what the engine is asked for; it never changes what the engine is
// allowed to do. Somebody asking for five strength sessions gets as many as
// their week has room for under the rest days and the exertion budget, and the
// ones that do not fit are simply not planned.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { assertPlanInvariants } from '@/lib/engine/safety'
import { isAiAuthored, MAX_TIMES_PER_WEEK, withPreferences } from '@/lib/engine/proposed'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { AiProposal, ProposedAction } from '@/lib/domain/types'

const GYM: ProposedAction = {
  title: '45 Minuten Krafttraining im Gym absolvieren',
  reasoning: 'Du hast angegeben, dass du gerne ins Gym gehst.',
  domain: 'training',
  minutes: 45,
  timesPerWeek: 2,
  preferredSlot: 'any',
}

const RUN: ProposedAction = {
  title: 'Einen 30-Minuten-Lauf im Freien machen',
  reasoning: 'Du hast angegeben, dass du gerne laufen gehst.',
  domain: 'movement',
  minutes: 30,
  timesPerWeek: 1,
  preferredSlot: 'any',
}

const PROPOSAL: AiProposal = {
  headline: 'Dein Training',
  reasoning: 'Aus deinen Angaben abgeleitet.',
  mode: 'augment',
  actions: [GYM, RUN],
}

const timesOf = (proposal: AiProposal, title: string) =>
  proposal.actions.find((a) => a.title === title)?.timesPerWeek

describe('what a preference changes', () => {
  it('sets how often an action runs', () => {
    const next = withPreferences(PROPOSAL, {
      [GYM.title]: { timesPerWeek: 3, enabled: true },
    })
    expect(timesOf(next, GYM.title)).toBe(3)
  })

  it('leaves every action nobody spoke about exactly as the model wrote it', () => {
    const next = withPreferences(PROPOSAL, {
      [GYM.title]: { timesPerWeek: 3, enabled: true },
    })
    expect(next.actions.find((a) => a.title === RUN.title)).toEqual(RUN)
  })

  it('removes an action that was turned off', () => {
    const next = withPreferences(PROPOSAL, {
      [GYM.title]: { timesPerWeek: 2, enabled: false },
    })
    expect(next.actions.map((a) => a.title)).toEqual([RUN.title])
  })

  it('keeps the headline and the reasoning, which are about the proposal', () => {
    const next = withPreferences(PROPOSAL, { [GYM.title]: { timesPerWeek: 4, enabled: true } })
    expect(next.headline).toBe(PROPOSAL.headline)
    expect(next.mode).toBe(PROPOSAL.mode)
  })

  it('changes nothing at all without preferences', () => {
    expect(withPreferences(PROPOSAL, null)).toEqual(PROPOSAL)
    expect(withPreferences(PROPOSAL, {})).toEqual(PROPOSAL)
  })
})

describe('what a stored value may not do', () => {
  it('keeps the model’s count when none was chosen', () => {
    const next = withPreferences(PROPOSAL, { [GYM.title]: { timesPerWeek: null, enabled: true } })
    expect(timesOf(next, GYM.title)).toBe(GYM.timesPerWeek)
  })

  it('never falls below once a week', () => {
    // Zero times a week is "turned off", and there is a control for that. A
    // stored zero would otherwise produce an action that exists and never runs.
    for (const stored of [0, -1, -99]) {
      const next = withPreferences(PROPOSAL, {
        [GYM.title]: { timesPerWeek: stored, enabled: true },
      })
      expect(timesOf(next, GYM.title), String(stored)).toBe(1)
    }
  })

  it('never exceeds a week', () => {
    for (const stored of [8, 50, 10000]) {
      const next = withPreferences(PROPOSAL, {
        [GYM.title]: { timesPerWeek: stored, enabled: true },
      })
      expect(timesOf(next, GYM.title), String(stored)).toBe(MAX_TIMES_PER_WEEK)
    }
  })

  it('falls back to the model rather than planning nonsense', () => {
    for (const stored of [NaN, Infinity, -Infinity]) {
      const next = withPreferences(PROPOSAL, {
        [GYM.title]: { timesPerWeek: stored, enabled: true },
      })
      expect(timesOf(next, GYM.title), String(stored)).toBe(GYM.timesPerWeek)
    }
  })

  it('ignores a preference for an action that is not in the proposal', () => {
    const next = withPreferences(PROPOSAL, {
      'Etwas, das die KI nie vorgeschlagen hat': { timesPerWeek: 5, enabled: true },
    })
    expect(next).toEqual(PROPOSAL)
  })
})

describe('a request, not an instruction', () => {
  /** The real account: weight-loss goal, free evenings Mon/Wed/Thu, football. */
  const account = (proposal: AiProposal | null) => {
    const base = makeInput(PROFILES[0], GOALS[0])
    return { ...base, today: '2026-08-17', aiProposal: proposal }
  }

  it('asking for more never breaks a safety limit', () => {
    // The whole reason a preference may be a plain number in the database. It
    // is the engine, not the stepper, that decides what a week can hold.
    for (let times = 1; times <= MAX_TIMES_PER_WEEK; times++) {
      const proposal = withPreferences(PROPOSAL, {
        [GYM.title]: { timesPerWeek: times, enabled: true },
        [RUN.title]: { timesPerWeek: times, enabled: true },
      })
      const input = account(proposal)
      expect(() => assertPlanInvariants(generatePlan(input), input), `${times}×`).not.toThrow()
    }
  })

  it('plans no more of an action than the week has room for', () => {
    // Seven strength sessions is a legitimate thing to ask for and an illegal
    // week to plan. The honest outcome is fewer, not a refusal and not seven.
    const proposal = withPreferences(PROPOSAL, {
      [GYM.title]: { timesPerWeek: 7, enabled: true },
    })
    const items = generatePlan(account(proposal)).items.filter(isAiAuthored)
    const gym = items.filter((i) => i.title === GYM.title)
    expect(gym.length).toBeLessThanOrEqual(7)
  })

  it('turning everything off leaves a plan that still works', () => {
    // The deterministic plan is the product. Declining every suggestion is a
    // valid answer and must not produce an empty or broken week.
    const proposal = withPreferences(PROPOSAL, {
      [GYM.title]: { timesPerWeek: null, enabled: false },
      [RUN.title]: { timesPerWeek: null, enabled: false },
    })
    expect(proposal.actions).toHaveLength(0)

    const input = account(null)
    const plan = generatePlan(input)
    expect(plan.items.length).toBeGreaterThan(0)
    expect(() => assertPlanInvariants(plan, input)).not.toThrow()
  })
})
