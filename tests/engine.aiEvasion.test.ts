// The safety limits, attacked the way a model would actually reach them.
//
// Every archetype invariant counted only the domain it owns: endurance summed
// `domain === 'training'`, habit counted `self_improvement`, and so on. The
// gate in proposed.ts blocks a proposal from the owned domain — and leaves
// `movement` open to all seven archetypes. So an action labelled `movement`
// was scheduled as a real, checkable action while being invisible to every
// count that decides whether the week is safe.
//
// This is not an adversarial input. PROPOSE_SYSTEM offers the model six
// domains and explains one of them; `movement` is the obvious label for a run.
//
// The existing hostile-AI test used `domain: 'training'` throughout, which for
// exactly the three archetypes with real limits means the actions were dropped
// before scheduling — so it asserted safety properties of a plan the AI never
// touched.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { PlanInvariantError } from '@/lib/engine/safety'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { AiProposal, PlanInput } from '@/lib/domain/types'

/** Schema-valid, and exactly what a model reaching for "a run" would write. */
const heavyMovement: AiProposal = {
  headline: 'Mehr Umfang für dein Ziel',
  reasoning: 'Du hast abends Zeit und willst schneller vorankommen.',
  mode: 'augment',
  actions: [1, 2, 3].map((n) => ({
    title: `Berglauf ${n}`,
    reasoning: 'Zusätzlicher Umfang, damit du dein Ziel früher erreichst.',
    domain: 'movement' as const,
    minutes: 90,
    timesPerWeek: 5 as const,
    preferredSlot: 'evening' as const,
  })),
}

const withProposal = (input: PlanInput, proposal: AiProposal): PlanInput => ({
  ...input,
  aiProposal: proposal,
})

/** Total minutes of real exertion in the week, whatever the label says. */
function exertionMinutes(plan: ReturnType<typeof generatePlan>): number {
  return plan.strategy.goalTrack.items
    .concat(plan.strategy.baseline.items)
    .filter((i) => i.domain === 'training' || i.domain === 'movement')
    .reduce((sum, i) => sum + (i.plannedDurationMin ?? 0) * (i.cadence === 'daily' ? 7 : 1), 0)
}

describe('a proposal cannot buy its way past a limit with a label', () => {
  const cases = [
    ['endurance', GOALS.find((g) => g.archetype === 'endurance')!],
    ['strength', GOALS.find((g) => g.archetype === 'strength')!],
    ['body_composition', GOALS.find((g) => g.archetype === 'body_composition')!],
  ] as const

  it.each(cases)('refuses 22 hours of "movement" on a %s goal', (_name, goal) => {
    for (const profile of PROFILES) {
      const input = withProposal(makeInput(profile, goal), heavyMovement)

      let minutes: number | null = null
      try {
        minutes = exertionMinutes(generatePlan(input))
      } catch (error) {
        // Refusing the week outright is a correct answer too.
        expect(error).toBeInstanceOf(PlanInvariantError)
        continue
      }

      // The number that matters is what the person is actually asked to do,
      // not what the invariant chose to count. The proposal asks for 22.5
      // hours; the archetype's own plan for these fixtures never exceeds 350
      // minutes, so anything above that means the proposal bought time the
      // archetype's limits never saw.
      expect(minutes).toBeLessThanOrEqual(350)
    }
  })
})

describe('the rest-day rule counts days, not labels', () => {
  it('never leaves a week with fewer rest days than the archetype requires', () => {
    const goal = GOALS.find((g) => g.archetype === 'strength')!

    for (const profile of PROFILES) {
      const input = withProposal(makeInput(profile, goal), heavyMovement)

      let plan
      try {
        plan = generatePlan(input)
      } catch (error) {
        expect(error).toBeInstanceOf(PlanInvariantError)
        continue
      }

      const strenuous = new Set(
        plan.strategy.goalTrack.items
          .concat(plan.strategy.baseline.items)
          .filter((i) => (i.domain === 'training' || i.domain === 'movement') && (i.plannedDurationMin ?? 0) >= 45)
          .map((i) => i.scheduledOn),
      )
      // Seven days of long exertion is what the proposal asks for. A week that
      // grants it has no rest day at all, whatever the counts say.
      expect(strenuous.size).toBeLessThanOrEqual(5)
    }
  })
})
