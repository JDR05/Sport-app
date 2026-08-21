// A running week has to be a week someone can actually run.
//
// Two defects lived here, and they hid each other. The duration of a session
// was capped to the time the person had, but its distance was not — so a week
// of two 45-minute evenings was presented as "22,0 km diese Woche" over
// sessions that between them held 13,3 km. And the floor worked the same way
// in reverse: a session too short to be worth doing was raised to the minimum
// while its recorded distance stayed at the small number the arithmetic
// produced, so a beginner ran an over-the-limit week that the ten percent
// invariant scored as compliant.
//
// Both are the same mistake — believing the numbers rather than the time — so
// both are pinned here.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { MAX_WEEKLY_VOLUME_GROWTH, MIN_VIABLE_SESSION_MINUTES } from '@/lib/engine/constants'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { PlanInput } from '@/lib/domain/types'

/** Six minutes a kilometre, the engine's planning pace. */
const MIN_PER_KM = 6

function runs(input: PlanInput) {
  return generatePlan(input).items.filter(
    (i) => i.details && typeof i.details.km === 'number',
  )
}

const enduranceInputs = PROFILES.map((p) => ({ name: p.name, input: makeInput(p, GOALS[2]) }))

describe('what the week promises and what it gives', () => {
  it.each(enduranceInputs)('$name: every session has time for its distance', ({ input }) => {
    for (const run of runs(input)) {
      const km = Number(run.details.km)
      const minutes = run.plannedDurationMin ?? 0
      // Within a minute of rounding. A card that says 9,9 km inside 45 minutes
      // is asking for a pace the plan never claimed.
      expect(Math.abs(minutes - km * MIN_PER_KM)).toBeLessThanOrEqual(1)
    }
  })

  it.each(enduranceInputs)('$name: the headline matches the sessions', ({ input }) => {
    const plan = generatePlan(input)
    const total = runs(input).reduce((sum, r) => sum + Number(r.details.km), 0)
    const headline = plan.strategy.goalTrack.headline
    const claimed = Number(headline.split(' ')[0].replace(',', '.'))
    expect(claimed).toBeCloseTo(total, 0)
  })

  it.each(enduranceInputs)('$name: stays inside the ten percent cap', ({ input }) => {
    const start = input.metrics.find((m) => m.metricKey === 'distance_km')?.startValue ?? 5
    const cap = start * (1 + MAX_WEEKLY_VOLUME_GROWTH)
    const total = runs(input).reduce((sum, r) => sum + Number(r.details.km), 0)
    expect(total).toBeLessThanOrEqual(cap + 0.5)
  })
})

describe('when the volume cannot pay for the sessions', () => {
  // A beginner at 8 km a week asking for three runs is asking for three
  // sessions that each cost at least the minimum viable length — 10 km in
  // total, above their cap. Fewer runs is the honest answer; shorter ones that
  // break the rule are not.
  const beginner = makeInput(PROFILES[7], GOALS[2])

  it('plans fewer runs rather than runs nobody should do', () => {
    const plan = generatePlan(beginner)
    const sessions = runs(beginner)
    expect(sessions.length).toBeGreaterThan(0)

    for (const s of sessions) {
      expect(s.plannedDurationMin ?? 0).toBeGreaterThanOrEqual(MIN_VIABLE_SESSION_MINUTES)
    }

    const start = beginner.metrics.find((m) => m.metricKey === 'distance_km')!.startValue!
    const total = sessions.reduce((sum, r) => sum + Number(r.details.km), 0)
    expect(total).toBeLessThanOrEqual(start * (1 + MAX_WEEKLY_VOLUME_GROWTH) + 0.5)
    expect(plan.strategy.goalTrack.headline).toContain('km')
  })

  it('never drops the week to nothing', () => {
    // Cutting sessions is right up to a point; a plan with no runs in it is
    // not a running plan.
    expect(runs(beginner).length).toBeGreaterThanOrEqual(1)
  })
})

describe('two different runners', () => {
  it('do not get the same week', () => {
    // The thing that made both defects invisible for so long: every fixture
    // carried the same 12 km start, so ten people got one plan and the test
    // suite called it personalisation.
    const volumes = PROFILES.map((p) =>
      runs(makeInput(p, GOALS[2])).reduce((sum, r) => sum + Number(r.details.km), 0),
    )
    expect(new Set(volumes.map((v) => Math.round(v / 5))).size).toBeGreaterThanOrEqual(4)
  })
})
