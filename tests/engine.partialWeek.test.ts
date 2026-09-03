// A week that starts on a Wednesday.
//
// Found on the real account, and it is the plainest kind of wrong: the
// headline said "1× Training" over a week containing none. The plan had put
// the single session on the Monday, the week was materialised on the Tuesday,
// and everything before the first day is dropped at the storage boundary. The
// engine planned into days that no longer existed, and the promise on the
// screen outlived the action it described.
//
// "in meinem Tagesablauf möchte ich nicht nur meine Scheißkalorien stehen
//  haben, sondern auch das was die KI schreibt mit Gymtraining"
//
// He was looking at a week of meals, steps and sleep, with the training gone.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { materialise } from '@/lib/db/item-mapping'
import { startOfWeek, addDays } from '@/lib/engine/dates'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { PlanInput } from '@/lib/domain/types'

/** The real account's week, field for field. */
function realAccount(today: string): PlanInput {
  const base = makeInput(PROFILES[0], GOALS[0])
  return {
    ...base,
    today,
    profile: {
      ...base.profile,
      sport: {
        ...base.profile.sport,
        experience: 'advanced',
        equipment: ['gym_membership'],
        sessionsPerWeekTarget: 2,
        preferredSessionMinutes: 60,
      },
    },
    schedule: {
      ...base.schedule,
      freeSlots: [
        { weekday: 'mon', start: '18:30', minutes: 60 },
        { weekday: 'wed', start: '18:30', minutes: 60 },
        { weekday: 'thu', start: '18:30', minutes: 60 },
      ],
      commitments: (['tue', 'fri', 'sun'] as const).map((weekday) => ({
        label: 'Fußball',
        weekday,
        start: '19:00',
        minutes: 90,
        kind: 'sport' as const,
        activity: 'football' as const,
      })),
      wakeTimes: {},
    },
  }
}

const trainingIn = (input: PlanInput) =>
  generatePlan(input).items.filter((i) => i.domain === 'training')

describe('nothing is planned onto a day that has already gone', () => {
  it('puts no dated action before today', () => {
    // Standing rules are exempt and have to be: the engine emits one item per
    // rule and the storage boundary expands it over the days the week really
    // has. Everything with a day of its own, though, has to be on a real one.
    const tuesday = addDays(startOfWeek('2026-09-01'), 1)
    const plan = generatePlan(realAccount(tuesday))

    for (const item of plan.items.filter((i) => i.cadence !== 'daily')) {
      expect(item.scheduledOn >= tuesday, item.title).toBe(true)
    }
  })

  it('survives the truncation that used to eat it', () => {
    // The exact sequence that produced the empty week: plan, then keep only
    // the days from the first one on. Nothing may be lost in between.
    const tuesday = addDays(startOfWeek('2026-09-01'), 1)
    const input = realAccount(tuesday)

    const planned = generatePlan(input)
    const stored = materialise(planned.items, startOfWeek(tuesday), tuesday)

    // Not one session may be lost on the way in. This is the assertion the
    // real account failed: one planned, none stored.
    expect(stored.filter((i) => i.domain === 'training').length).toBe(
      planned.items.filter((i) => i.domain === 'training').length,
    )
  })

  it('keeps the training this person’s week has room for', () => {
    // Free on Monday, Wednesday and Thursday; football on the other three.
    // Signing up on Tuesday leaves Wednesday and Thursday, and both are
    // usable — so the week is not allowed to come back empty.
    const tuesday = addDays(startOfWeek('2026-09-01'), 1)
    expect(trainingIn(realAccount(tuesday)).length).toBeGreaterThan(0)
  })

  it('says in the headline only what the week actually holds', () => {
    // The failure as the person saw it: a promise of training over a week
    // with none in it.
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays('2026-08-31', offset)
      const plan = generatePlan(realAccount(day))
      const sessions = plan.items.filter((i) => i.domain === 'training').length
      const promised = plan.strategy.goalTrack.headline.match(/(\d+)× Training/)

      if (promised) {
        expect(Number(promised[1]), `${day}: ${plan.strategy.goalTrack.headline}`).toBe(sessions)
      }
    }
  })
})

describe('a full week is still a full week', () => {
  it('uses every day when the plan is made on the Monday', () => {
    // The control on the rule above: a filter that was too eager would shrink
    // every week, not only the ones that start late.
    const monday = startOfWeek('2026-09-01')
    expect(trainingIn(realAccount(monday)).length).toBeGreaterThan(
      trainingIn(realAccount(addDays(monday, 3))).length,
    )
  })

  it('shrinks as the week runs out, and never grows', () => {
    // The other half of the same rule, and the one that caught a second bug:
    // late in the week no offered day was left, the engine fell through to
    // its "nobody gave me any time" assumption, and invented training on days
    // this person had never offered. A week nearly over holds less — never
    // something made up.
    let previous = Number.POSITIVE_INFINITY
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays('2026-08-31', offset)
      const count = trainingIn(realAccount(day)).length
      expect(count, day).toBeLessThanOrEqual(previous)
      previous = count
    }
  })
})
