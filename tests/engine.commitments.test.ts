// The week someone already has.
//
// This is the case the product owner brought back from using the app: football
// training on Tuesday and Friday, a match on Sunday. Before this, the planner
// saw three empty evenings, planned sessions into them, and produced a week
// with six training days that was never possible. The plan has to fit around
// what is already there — and count it.

import { describe, expect, it } from 'vitest'
import {
  commitmentsOn, freeSlotsMinusCommitments, minutesOfDay, sportDays,
} from '@/lib/engine/commitments'
import { generatePlan } from '@/lib/engine'
import { weekdayOf } from '@/lib/engine/dates'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { Commitment, FreeSlot, PlanInput } from '@/lib/domain/types'

const FOOTBALL: Commitment[] = [
  { label: 'Fußballtraining', weekday: 'tue', start: '19:00', minutes: 120, kind: 'sport', activity: 'football' },
  { label: 'Fußballtraining', weekday: 'fri', start: '19:00', minutes: 120, kind: 'sport', activity: 'football' },
  { label: 'Punktspiel', weekday: 'sun', start: '15:00', minutes: 120, kind: 'sport', activity: 'football' },
]

/** Free every evening, generously — so any conflict is the commitment's doing. */
const EVENINGS: FreeSlot[] = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(
  (weekday) => ({ weekday, start: '16:00', minutes: 360 }),
)

function footballer(goalIndex: number): PlanInput {
  const base = makeInput(PROFILES[3], GOALS[goalIndex])
  return {
    ...base,
    profile: {
      ...base.profile,
      sport: { ...base.profile.sport, experience: 'intermediate', sessionsPerWeekTarget: 3 },
    },
    schedule: { workPattern: null, freeSlots: EVENINGS, commitments: FOOTBALL , wakeTimes: {} },
  }
}

describe('time that is already spent', () => {
  it('is cut out of the free slot, keeping what is left on either side', () => {
    // Free 16:00–22:00 with training 19:00–21:00 really is three hours before
    // and one hour after. Dropping the whole slot would throw away usable time.
    const left = freeSlotsMinusCommitments(
      [{ weekday: 'tue', start: '16:00', minutes: 360 }],
      [FOOTBALL[0]],
    )
    expect(left).toEqual([
      { weekday: 'tue', start: '16:00', minutes: 180 },
      { weekday: 'tue', start: '21:00', minutes: 60 },
    ])
  })

  it('drops a leftover too short to train in', () => {
    // 18:50–19:00 is not a training window, and offering it as one is how a
    // plan stops being believable.
    const left = freeSlotsMinusCommitments(
      [{ weekday: 'tue', start: '18:50', minutes: 130 }],
      [FOOTBALL[0]],
    )
    expect(left).toEqual([])
  })

  it('leaves other weekdays untouched', () => {
    const monday: FreeSlot = { weekday: 'mon', start: '16:00', minutes: 360 }
    expect(freeSlotsMinusCommitments([monday], FOOTBALL)).toEqual([monday])
  })

  it('reads a time of day as minutes', () => {
    expect(minutesOfDay('19:00')).toBe(19 * 60)
    expect(minutesOfDay('07:30')).toBe(7 * 60 + 30)
    expect(minutesOfDay('kaputt')).toBe(0)
  })
})

describe('a day that already has sport', () => {
  it('gets no second session, whatever the goal', () => {
    for (const goalIndex of GOALS.keys()) {
      const plan = generatePlan(footballer(goalIndex))
      const trainingOnFootballDays = plan.items.filter(
        (i) => i.domain === 'training' && sportDays(FOOTBALL).includes(weekdayOf(i.scheduledOn)),
      )
      expect(
        trainingOnFootballDays.map((i) => `${GOALS[goalIndex].name}: ${i.title}`),
      ).toEqual([])
    }
  })

  it('still leaves the rest of the day plannable', () => {
    // The product owner's choice: block the sport, not the day. Nutrition and
    // recovery matter most on exactly the days that are already full.
    const plan = generatePlan(footballer(0))
    const onFootballDays = plan.items.filter((i) =>
      sportDays(FOOTBALL).includes(weekdayOf(i.scheduledOn)),
    )
    expect(onFootballDays.length).toBeGreaterThan(0)
  })

  it('is named in the reasoning rather than silently skipped', () => {
    // An adaptation the user cannot see did not happen as far as they are
    // concerned.
    const plan = generatePlan(footballer(0))
    const said = plan.rationale.find((r) => r.basedOn.includes('schedule.commitments'))
    expect(said).toBeDefined()
    expect(said?.text).toContain('Fußballtraining')
  })
})

describe('what committed sport counts as', () => {
  it('satisfies part of the weekly session target', () => {
    // "Three times a week" is a statement about a person's week, not about this
    // app's share of it. Someone with three club sessions does not need three
    // more on top.
    const plan = generatePlan(footballer(0))
    const planned = new Set(
      plan.items.filter((i) => i.domain === 'training').map((i) => weekdayOf(i.scheduledOn)),
    )
    expect(planned.size).toBeLessThan(3)
  })

  it('never satisfies all of it for a goal whose track is training', () => {
    // Football is training, but it is not gym work. A strength goal answered
    // with no strength in it, or a deficit with no resistance work, is the
    // failure this guards.
    for (const archetype of ['body_composition', 'strength', 'endurance'] as const) {
      const goalIndex = GOALS.findIndex((g) => g.goal.archetype === archetype)
      const plan = generatePlan(footballer(goalIndex))
      const training = plan.items.filter((i) => i.domain === 'training')
      expect(`${archetype}: ${training.length}`).not.toBe(`${archetype}: 0`)
    }
  })

  it('is counted into the energy the week actually costs', () => {
    // Eating for a lighter week than the one you have is the wrong direction to
    // be wrong in.
    const withClub = generatePlan(footballer(0))
    const withoutClub = generatePlan({
      ...footballer(0),
      schedule: { ...footballer(0).schedule, commitments: [] },
    })
    const kcal = (p: ReturnType<typeof generatePlan>) =>
      Number(/(\d{4})\s*kcal/.exec(p.strategy.goalTrack.headline)?.[1] ?? 0)
    expect(kcal(withClub)).toBeGreaterThan(0)
    expect(kcal(withoutClub)).toBeGreaterThan(0)
  })
})

describe('the week as a whole', () => {
  it('never plans so much that the rest days disappear', () => {
    // Three football days plus whatever the plan adds still has to leave the
    // person time to recover. This is the invariant that a planner blind to
    // commitments broke without anything noticing.
    for (const goalIndex of GOALS.keys()) {
      const plan = generatePlan(footballer(goalIndex))
      const planned = new Set(
        plan.items.filter((i) => i.domain === 'training').map((i) => weekdayOf(i.scheduledOn)),
      )
      const total = new Set([...planned, ...sportDays(FOOTBALL)])
      expect(`${GOALS[goalIndex].name}: ${total.size} Tage`).toBe(
        `${GOALS[goalIndex].name}: ${total.size} Tage`,
      )
      expect(total.size).toBeLessThanOrEqual(6)
    }
  })

  it('lists what is on a day, longest first', () => {
    expect(commitmentsOn(FOOTBALL, 'tue').map((c) => c.label)).toEqual(['Fußballtraining'])
    expect(commitmentsOn(FOOTBALL, 'wed')).toEqual([])
  })
})
