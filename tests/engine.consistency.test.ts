// The headline has to be true.
//
// Every number a person reads at the top of a screen is a promise about the
// plan underneath it, and the two drifted apart in two different ways at once:
// "3× Kraft" above a week containing two, because the count came from the
// request rather than from the placement; and "13,2 km" above a single run of
// 5,9 km, because the weekly volume was the one the progression allowed rather
// than the one the week could hold.
//
// Both only appeared once the week had something in it already. A gate that
// runs over every profile and every goal, with and without a club schedule,
// is the thing that would have caught them.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { ALL_COMBINATIONS, GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { Commitment, FreeSlot, PlanInput } from '@/lib/domain/types'

const CLUB: Commitment[] = [
  { label: 'Fußballtraining', weekday: 'tue', start: '19:00', minutes: 120, kind: 'sport', activity: 'football' },
  { label: 'Fußballtraining', weekday: 'fri', start: '19:00', minutes: 120, kind: 'sport', activity: 'football' },
  { label: 'Punktspiel', weekday: 'sun', start: '15:00', minutes: 120, kind: 'sport', activity: 'football' },
]

const EVENINGS: FreeSlot[] = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(
  (weekday) => ({ weekday, start: '16:00', minutes: 360 }),
)

/** Every profile with every goal, then the same again with a club week. */
const CASES: Array<{ name: string; input: PlanInput }> = [
  ...ALL_COMBINATIONS,
  ...PROFILES.flatMap((p) =>
    GOALS.map((g) => ({
      name: `${p.name} · ${g.name} · im Verein`,
      input: {
        ...makeInput(p, g),
        schedule: { workPattern: null, freeSlots: EVENINGS, commitments: CLUB , wakeTimes: {} },
      },
    })),
  ),
]

function trainingItems(plan: ReturnType<typeof generatePlan>) {
  return plan.strategy.goalTrack.items.filter((i) => i.domain === 'training')
}

describe('what the headline claims', () => {
  it('never names more sessions than the plan contains', () => {
    for (const { name, input } of CASES) {
      const plan = generatePlan(input)
      const claimed = /(\d+)×/.exec(plan.strategy.goalTrack.headline)?.[1]
      if (claimed === undefined) continue

      const actual = trainingItems(plan).length
      // Equality rather than "at most": a plan that quietly does more than it
      // says is just as confusing as one that does less.
      expect(`${name}: sagt ${claimed}, plant ${actual}`).toBe(
        `${name}: sagt ${claimed}, plant ${claimed}`,
      )
    }
  })

  it('never names more kilometres than the plan contains', () => {
    for (const { name, input } of CASES) {
      const plan = generatePlan(input)
      const claimed = /([\d,]+)\s*km/.exec(plan.strategy.goalTrack.headline)?.[1]
      if (claimed === undefined) continue

      const planned = trainingItems(plan).reduce((sum, i) => sum + Number(i.details.km ?? 0), 0)
      const claimedKm = Number(claimed.replace(',', '.'))
      // A tenth of a kilometre of slack for rounding across several sessions.
      expect(`${name}: ${Math.abs(planned - claimedKm) <= 0.1}`).toBe(`${name}: true`)
    }
  })
})

describe('every plan, club week or not', () => {
  it('leaves at least one day without a training session', () => {
    for (const { name, input } of CASES) {
      const plan = generatePlan(input)
      const trainingDays = new Set([
        ...trainingItems(plan).map((i) => i.scheduledOn),
        ...input.schedule.commitments.filter((c) => c.kind === 'sport').map((c) => c.weekday),
      ])
      expect(`${name}: ${trainingDays.size}`).not.toBe(`${name}: 7`)
    }
  })

  it('gives a goal whose track is training at least one session of its own', () => {
    // Someone else's hobby is not this goal's plan. Football is training, but
    // answering "get stronger" with nothing but football is not an answer.
    const trainingGoals = ['body_composition', 'strength', 'endurance'] as const
    for (const { name, input } of CASES) {
      if (!trainingGoals.includes(input.goal.archetype as (typeof trainingGoals)[number])) continue
      const plan = generatePlan(input)
      expect(`${name}: ${trainingItems(plan).length}`).not.toBe(`${name}: 0`)
    }
  })
})
