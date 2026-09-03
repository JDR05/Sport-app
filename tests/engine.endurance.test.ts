// A running week has to be a week someone can actually run.
//
// Three defects lived here, in sequence — each fix exposed the next.
//
// First, duration was capped to the time the person had, but distance was
// not: two 45-minute evenings were presented as "22,0 km diese Woche" over
// sessions that between them held 13,3 km.
//
// Fixing that exposed the reverse case: a session too short to be worth doing
// had its duration raised to a floor, and its distance was then recomputed
// *from that floored duration* — so a beginner's week came out over the ten
// percent cap while the invariant that exists to catch exactly that read it
// as compliant.
//
// The tempting fix — plan fewer, longer sessions so none needs flooring —
// exposed a third bug on the way: with only one session, the long-run/easy-run
// split still applied, so that single session claimed only 45 % of the week's
// budget and the other 55 % vanished.
//
// The real fix separates two reasons a duration can move. A window too short
// for the planned distance legitimately shrinks it. A duration raised only to
// clear the "worth leaving the house for" floor must never inflate distance —
// the session gets more time, not more claimed kilometres. That one rule
// dissolves all three failures at once, and the requested session count is
// respected rather than silently reduced.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { MAX_SINGLE_RUN_SHARE, MAX_WEEKLY_VOLUME_GROWTH, MIN_VIABLE_SESSION_MINUTES } from '@/lib/engine/constants'
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
  it.each(enduranceInputs)('$name: every session has enough time for its distance', ({ input }) => {
    for (const run of runs(input)) {
      const km = Number(run.details.km)
      const minutes = run.plannedDurationMin ?? 0
      // At least enough time, with a minute of rounding slack — never less.
      // It may be *more*: a session floored to the minimum viable length
      // carries spare time on purpose rather than have that floor inflate the
      // distance it claims.
      expect(minutes).toBeGreaterThanOrEqual(km * MIN_PER_KM - 1)
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

describe('when the naive split would be too short to be worth doing', () => {
  // A beginner at 8 km a week asking for three runs: split evenly-ish, the two
  // easy runs come to a bit over 2 km each — under the minimum viable length.
  // The session count is still honoured; each session's time is floored to be
  // worth doing, and its distance stays at its true, smaller share rather than
  // growing to match the floored time.
  const beginner = makeInput(PROFILES[7], GOALS[2])

  it('keeps the requested number of sessions', () => {
    const plan = generatePlan(beginner)
    const sessions = runs(beginner)
    expect(sessions.length).toBe(beginner.profile.sport.sessionsPerWeekTarget)

    for (const s of sessions) {
      expect(s.plannedDurationMin ?? 0).toBeGreaterThanOrEqual(MIN_VIABLE_SESSION_MINUTES)
    }

    const start = beginner.metrics.find((m) => m.metricKey === 'distance_km')!.startValue!
    const total = sessions.reduce((sum, r) => sum + Number(r.details.km), 0)
    expect(total).toBeLessThanOrEqual(start * (1 + MAX_WEEKLY_VOLUME_GROWTH) + 0.5)
    expect(plan.strategy.goalTrack.headline).toContain('km')
  })

  it('never drops the week to nothing', () => {
    expect(runs(beginner).length).toBeGreaterThanOrEqual(1)
  })
})

describe('a week with only one session', () => {
  // This rule was the other way round, and the reversal is deliberate.
  //
  // The old version handed a single run the entire week's volume, so that the
  // headline and the sessions would agree — the concern being that a 45 %
  // share silently lost half the week. But the headline is computed from what
  // the sessions actually hold, so it was already honest either way, while the
  // remedy was not: for somebody with club training on two evenings and a
  // 10 km goal it produced one run of twenty kilometres. That is exactly the
  // step increase MAX_WEEKLY_VOLUME_GROWTH exists to prevent, arrived at from
  // the other direction, and no invariant caught it because the *weekly* total
  // was within the cap.
  //
  // A week that can hold one run holds less than the progression allowed. The
  // plan says the smaller number rather than inventing a session to justify
  // the bigger one.
  const oneSessionWeek = () => {
    const base = makeInput(PROFILES[0], GOALS[2])
    return {
      base,
      input: {
        ...base,
        profile: { ...base.profile, sport: { ...base.profile.sport, sessionsPerWeekTarget: 1 } },
        schedule: {
          // A generous window on purpose, so the window is not what limits the
          // distance here — the split is the thing under test.
          ...base.schedule,
          freeSlots: [{ weekday: 'sat', start: '09:00', minutes: 240 }],
        },
      } as PlanInput,
    }
  }

  it('does not put a whole week of mileage into one run', () => {
    const { base, input } = oneSessionWeek()
    const start = base.metrics.find((m) => m.metricKey === 'distance_km')!.startValue!
    const weekly = round(start * (1 + MAX_WEEKLY_VOLUME_GROWTH))

    const sessions = runs(input)
    expect(sessions).toHaveLength(1)
    expect(Number(sessions[0].details.km)).toBeLessThan(weekly)
    expect(Number(sessions[0].details.km)).toBeCloseTo(weekly * MAX_SINGLE_RUN_SHARE, 0)
  })

  it('still gives it a run worth leaving the house for', () => {
    // The control on the rule above: a cap that shrank the run to nothing
    // would satisfy "less than the week" and be useless.
    const { base, input } = oneSessionWeek()
    const start = base.metrics.find((m) => m.metricKey === 'distance_km')!.startValue!
    const weekly = round(start * (1 + MAX_WEEKLY_VOLUME_GROWTH))

    expect(Number(runs(input)[0].details.km)).toBeGreaterThan(weekly * 0.5)
  })

  it('still shrinks to fit a window that is the real constraint', () => {
    // The other side of the same coin: when time genuinely is the limit, the
    // single session must not claim more distance than it was given room for.
    const base = makeInput(PROFILES[0], GOALS[2])
    const oneSession: PlanInput = {
      ...base,
      profile: { ...base.profile, sport: { ...base.profile.sport, sessionsPerWeekTarget: 1 } },
      schedule: { ...base.schedule, freeSlots: [{ weekday: 'sat', start: '09:00', minutes: 30 }] },
    }
    const sessions = runs(oneSession)
    expect(sessions).toHaveLength(1)
    expect(Number(sessions[0].details.km)).toBeCloseTo(5, 0) // 30 min at 6 min/km
  })
})

function round(n: number): number {
  return Math.round(n * 10) / 10
}

describe('a starting volume the app never refuses', () => {
  // The QA agent's own reproduction: "10 km pro Woche" — the single most
  // likely answer to a "wie viele km läufst du aktuell" question for a 10 km
  // goal — threw the app into an unrecoverable error card. So did every start
  // volume from roughly 3 km down to nothing.
  it.each([10, 9.5, 8, 2, 1.5, 1, 0.5])(
    'produces a plan for a starting volume of %s km/week',
    (km) => {
      const base = makeInput(PROFILES[0], GOALS[2])
      const input: PlanInput = {
        ...base,
        metrics: [{
          metricKey: 'distance_km',
          startValue: km,
          targetValue: km * 2.5,
          currentValue: null,
          unit: 'km',
        }],
      }
      expect(() => generatePlan(input)).not.toThrow()
      const plan = generatePlan(input)
      expect(runs(input).length).toBeGreaterThan(0)
      expect(plan.strategy.goalTrack.headline).toContain('km')
    },
  )
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
