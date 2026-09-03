// Football is training. It is not a bench press.
//
// The engine counted every sport commitment as a substitute for a session it
// would otherwise have planned, so somebody who plays twice a week had their
// strength plan cut from three sessions to one — while three evenings of that
// week stood empty. The product owner named it exactly:
//
//   "Ich hab ja dann trotzdem an anderen Tagen noch Zeit für Krafttraining."
//
// The distinction these tests pin down is between two questions the engine had
// merged into one. A commitment always costs recovery and always eats into the
// rest-day budget — that is load, and it is unchanged. Whether it *replaces*
// the goal's own work is a separate question, and only the same kind of work
// answers it.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { goalSessions } from '@/lib/engine/commitments'
import { ENDURANCE_ACTIVITIES, STRENGTH_ACTIVITIES } from '@/lib/engine/constants'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { Activity, Commitment, PlanInput } from '@/lib/domain/types'

const twiceWeekly = (label: string, activity: Activity): Commitment[] =>
  (['tue', 'thu'] as const).map((weekday) => ({
    label,
    weekday,
    start: '19:00',
    minutes: 90,
    kind: 'sport',
    activity,
  }))

const FOOTBALL = twiceWeekly('Fußballtraining', 'football')
const GYM = twiceWeekly('Gym mit Kumpel', 'gym')
const RUNNING = twiceWeekly('Lauftreff', 'running')

function withCommitments(input: PlanInput, commitments: Commitment[]): PlanInput {
  return { ...input, schedule: { ...input.schedule, commitments } }
}

const trainingCount = (input: PlanInput) =>
  generatePlan(input).items.filter((i) => i.domain === 'training').length

describe('counting the sport that does the same job', () => {
  it('counts nothing when the activity is not the goal’s kind of work', () => {
    expect(goalSessions(FOOTBALL, STRENGTH_ACTIVITIES)).toBe(0)
    expect(goalSessions(FOOTBALL, ENDURANCE_ACTIVITIES)).toBe(0)
  })

  it('counts it when it is', () => {
    expect(goalSessions(GYM, STRENGTH_ACTIVITIES)).toBe(2)
    expect(goalSessions(RUNNING, ENDURANCE_ACTIVITIES)).toBe(2)
  })

  it('counts days, not entries', () => {
    // Two sessions on one Tuesday is one training day, and every downstream
    // rule counts days.
    const twiceOnTuesday: Commitment[] = [
      { ...GYM[0], start: '07:00' },
      { ...GYM[0], start: '19:00' },
    ]
    expect(goalSessions(twiceOnTuesday, STRENGTH_ACTIVITIES)).toBe(1)
  })

  it('ignores anything that is not sport', () => {
    const shift: Commitment[] = [{ ...GYM[0], kind: 'work', activity: null }]
    expect(goalSessions(shift, STRENGTH_ACTIVITIES)).toBe(0)
  })

  it('falls back to counting every sport when nobody said what counts', () => {
    // The old behaviour, kept for any archetype that has not thought about it.
    expect(goalSessions(FOOTBALL, undefined)).toBe(2)
  })
})

describe('a strength goal keeps its gym work', () => {
  const strength = makeInput(PROFILES[0], GOALS[1])

  it('still plans sessions for somebody who plays football twice a week', () => {
    const alone = trainingCount(strength)
    const withFootball = trainingCount(withCommitments(strength, FOOTBALL))

    expect(alone).toBeGreaterThan(1)
    // Fewer days are free, so fewer sessions fit — but not the collapse to one
    // that made this worth fixing.
    expect(withFootball).toBeGreaterThan(1)
  })

  it('does give way to an actual gym commitment', () => {
    // The control, and the reason this is a distinction rather than a licence:
    // somebody who already lifts twice a week does not need three more.
    const withGym = trainingCount(withCommitments(strength, GYM))
    expect(withGym).toBeLessThan(trainingCount(withCommitments(strength, FOOTBALL)))
  })
})

describe('a weight goal keeps its resistance work', () => {
  // A deficit without resistance work costs muscle, and that is the one thing
  // losing weight must not do. Football helps the energy balance; it does not
  // do this.
  const weight = makeInput(PROFILES[0], GOALS[0])

  it('does not let football replace the gym sessions', () => {
    expect(trainingCount(withCommitments(weight, FOOTBALL))).toBeGreaterThan(1)
  })
})

describe('load and recovery still count every sport', () => {
  it('never plans a session onto a day that already carries one', () => {
    for (const goal of GOALS.slice(0, 3)) {
      const plan = generatePlan(withCommitments(makeInput(PROFILES[0], goal), FOOTBALL))
      const trainingDays = plan.items
        .filter((i) => i.domain === 'training')
        .map((i) => new Date(`${i.scheduledOn}T00:00:00Z`).getUTCDay())

      // 2 = Tuesday, 4 = Thursday.
      expect(trainingDays, goal.name).not.toContain(2)
      expect(trainingDays, goal.name).not.toContain(4)
    }
  })

  it('keeps every safety invariant with a full week of commitments', () => {
    // Five sport days plus whatever the archetype wants is the case where
    // rest days have to win. generatePlan throws on a violation.
    const everyDay: Commitment[] = (['mon', 'tue', 'wed', 'thu', 'fri'] as const).map(
      (weekday) => ({ ...FOOTBALL[0], weekday }),
    )
    for (const profile of PROFILES.slice(0, 5)) {
      for (const goal of GOALS.slice(0, 3)) {
        expect(
          () => generatePlan(withCommitments(makeInput(profile, goal), everyDay)),
          `${profile.name} · ${goal.name}`,
        ).not.toThrow()
      }
    }
  })
})

describe('the long run is the longest run', () => {
  it('holds at every session count a week can produce', () => {
    // With two runs the remaining 55 % all landed on the single easy day, so
    // the "lockerer Lauf" came out at 12,1 km beside a "langer Lauf" of 9,8.
    const endurance = makeInput(PROFILES[0], GOALS[2])

    for (const commitments of [[], FOOTBALL, [FOOTBALL[0]]]) {
      const runs = generatePlan(withCommitments(endurance, commitments)).items.filter(
        (i) => i.domain === 'training',
      )
      const long = runs.find((i) => i.title.startsWith('Langer Lauf'))
      if (!long || runs.length < 2) continue

      const longest = Math.max(...runs.map((i) => Number(i.details.km)))
      expect(Number(long.details.km)).toBe(longest)
    }
  })
})
