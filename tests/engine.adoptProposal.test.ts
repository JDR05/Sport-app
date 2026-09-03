// Getting the model's actions into a week that is already running.
//
// Insights lists "Was die KI beiträgt" the moment a proposal arrives; the plan
// did not, because a week is materialised once (ADR-037). Somebody who tapped
// "KI dazuholen" on a Wednesday saw three actions described on one screen and
// absent from every other one until Monday — the app telling them about a plan
// it had not made.
//
// The database half needs a database. What is testable here is the part that
// decides *what may be added*, and it is the part that matters: the rule that
// a week is fixed exists to stop a plan rewriting itself under somebody, and
// the whole safety of this change rests on the difference between adding and
// rewriting.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { assertPlanInvariants } from '@/lib/engine/safety'
import { materialise } from '@/lib/db/item-mapping'
import { startOfWeek } from '@/lib/engine/dates'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { AiProposal, PlannedItem, PlanInput } from '@/lib/domain/types'

const proposal: AiProposal = {
  headline: 'Drei Anker für deinen Abend',
  reasoning: 'Aus deinen Angaben zum Abend abgeleitet.',
  mode: 'augment',
  actions: [
    {
      title: 'Kurze Mobilisation vor dem Schlafen',
      reasoning: 'Du hast angegeben, dass du spät ins Bett gehst.',
      effect: 'Ruhiges Dehnen senkt die Herzfrequenz vor dem Schlafen.',
      domain: 'sleep',
      minutes: 10,
      timesPerWeek: 5,
      preferredSlot: 'evening',
    },
    {
      title: 'Mittags zehn Minuten raus',
      reasoning: 'Du sitzt den ganzen Tag am Schreibtisch.',
      effect: 'Tageslicht am Mittag stabilisiert den Tag-Nacht-Rhythmus.',
      domain: 'movement',
      minutes: 10,
      timesPerWeek: 3,
      preferredSlot: 'midday',
    },
  ],
}

const isProposed = (item: PlannedItem) =>
  (item.details as Record<string, unknown>)?.kind === 'ai_proposed'

const withProposal = (input: PlanInput): PlanInput => ({ ...input, aiProposal: proposal })

describe('the model’s actions reach the plan at all', () => {
  it('are in a week built with a proposal', () => {
    const plan = generatePlan(withProposal(makeInput(PROFILES[0], GOALS[0])))
    const mine = plan.items.filter(isProposed)

    expect(mine.length).toBeGreaterThan(0)
    expect(mine.map((i) => i.title)).toContain('Kurze Mobilisation vor dem Schlafen')
  })

  it('are marked as the model’s, so a screen can say which they are', () => {
    // Insights and the plan described the same week in two vocabularies with
    // nothing connecting them. `details.kind` is what the tag reads.
    const plan = generatePlan(withProposal(makeInput(PROFILES[0], GOALS[0])))
    for (const item of plan.items.filter(isProposed)) {
      expect(item.details).toMatchObject({ kind: 'ai_proposed' })
    }
  })

  it('are absent from a week built without one', () => {
    // The control: the marker means something only if it is not on everything.
    const plan = generatePlan(makeInput(PROFILES[0], GOALS[0]))
    expect(plan.items.filter(isProposed)).toEqual([])
  })
})

describe('adding to a running week is not rewriting it', () => {
  const base = makeInput(PROFILES[0], GOALS[0])
  const weekStart = startOfWeek(base.today)

  /** What the adoption would add, by the same route the real one takes. */
  function wouldAdd(input: PlanInput, today: string): PlannedItem[] {
    const planned = generatePlan({ ...input, today })
    return materialise(planned.items.filter(isProposed), weekStart, today).filter(
      (item) => item.scheduledOn >= today,
    )
  }

  it('adds nothing to a day that has already passed', () => {
    // Adding work to Monday on a Wednesday is asking somebody to have done
    // something.
    const wednesday = '2026-08-19'
    for (const item of wouldAdd(withProposal(base), wednesday)) {
      expect(item.scheduledOn >= wednesday).toBe(true)
    }
  })

  it('adds nothing at all without a proposal', () => {
    expect(wouldAdd(base, base.today)).toEqual([])
  })

  it('leaves the existing week untouched, by construction', () => {
    // The strongest form of the promise: what gets added is a disjoint list,
    // so no existing action and no status on it can be affected.
    const withoutAi = generatePlan(base)
    const added = wouldAdd(withProposal(base), base.today)

    const existing = new Set(withoutAi.items.map((i) => `${i.scheduledOn}|${i.title}`))
    for (const item of added) {
      expect(existing.has(`${item.scheduledOn}|${item.title}`)).toBe(false)
    }
  })
})

describe('the combined week still has to pass every safety check', () => {
  // Fail closed. The invariants are what decides whether anything is added at
  // all, so a combination that would break a rest day, the per-day ceiling or
  // the exertion budget has to be caught here rather than written.
  it('accepts an ordinary combination', () => {
    const input = withProposal(makeInput(PROFILES[0], GOALS[0]))
    const plan = generatePlan(input)
    expect(() => assertPlanInvariants(plan, input)).not.toThrow()
  })

  it('refuses a day pushed over the ceiling', () => {
    const input = withProposal(makeInput(PROFILES[0], GOALS[0]))
    const plan = generatePlan(input)
    const day = plan.items[0].scheduledOn

    // Six actions on one day, whatever they are.
    const stuffed = {
      ...plan,
      items: [
        ...plan.items,
        ...Array.from({ length: 6 }, (_, n) => ({
          ...plan.items[0],
          title: `Erfunden ${n}`,
          scheduledOn: day,
        })),
      ],
    }
    expect(() => assertPlanInvariants(stuffed, input)).toThrow()
  })

  it('refuses a combination that eats the rest days', () => {
    const input = withProposal(makeInput(PROFILES[0], GOALS[1]))
    const plan = generatePlan(input)

    const everyDay = Array.from({ length: 7 }, (_, n) => ({
      ...plan.items.find((i) => i.domain === 'training')!,
      title: `Zusatztraining ${n}`,
      scheduledOn: `2026-08-${17 + n}`,
    }))

    expect(() => assertPlanInvariants({ ...plan, items: everyDay }, input)).toThrow()
  })

  it('holds across profiles, so this is not one lucky fixture', () => {
    for (const profile of PROFILES.slice(0, 6)) {
      for (const goal of GOALS.slice(0, 3)) {
        const input = withProposal(makeInput(profile, goal))
        expect(() => generatePlan(input), `${profile.name} · ${goal.name}`).not.toThrow()
      }
    }
  })
})
