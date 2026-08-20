// The night is not free time.
//
// The case these tests are written from is the product owner's own: football
// until nine on Tuesday, up at five on Wednesday. A planner that treats that
// Tuesday evening as an empty slot does not add a session — it removes sleep,
// and the safety rules say the app never does that.

import { describe, expect, it } from 'vitest'
import { shortNights, nextWeekday } from '@/lib/engine/night'
import { MIN_NIGHT_HOURS, WIND_DOWN_MINUTES } from '@/lib/engine/constants'
import { generatePlan } from '@/lib/engine'
import { weekdayOf } from '@/lib/engine/dates'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { Commitment, Schedule } from '@/lib/domain/types'

const football: Commitment = {
  label: 'Fußballtraining',
  weekday: 'tue',
  start: '19:00',
  minutes: 120,
  kind: 'sport',
  activity: 'football',
}

function schedule(over: Partial<Schedule> = {}): Schedule {
  return {
    workPattern: 'student',
    freeSlots: [],
    commitments: [football],
    wakeTimes: { wed: '05:00' },
    ...over,
  }
}

describe('how much night is left', () => {
  it('measures from the end of the commitment to the alarm', () => {
    // 21:00 + an hour to get home and settle = asleep 22:00, up at 05:00.
    const [night] = shortNights(schedule())
    expect(night.weekday).toBe('tue')
    expect(night.hours).toBeCloseTo(7)
    expect(night.because.label).toBe('Fußballtraining')
  })

  it('gets shorter as the commitment runs later', () => {
    const late = shortNights(schedule({ commitments: [{ ...football, minutes: 180 }] }))
    expect(late[0].hours).toBeCloseTo(6)
  })

  it('counts the wind-down, not just the end time', () => {
    const [night] = shortNights(schedule())
    expect(night.asleepAt).toBe(21 * 60 + WIND_DOWN_MINUTES)
  })

  it('says nothing when the morning after is unknown', () => {
    // No wake time is not "probably early". It is no answer, and the engine
    // must not reason about a number nobody gave it.
    expect(shortNights(schedule({ wakeTimes: {} }))).toEqual([])
  })

  it('says nothing when there is no commitment to shorten the night', () => {
    expect(shortNights(schedule({ commitments: [] }))).toEqual([])
  })

  it('leaves a comfortable night alone', () => {
    const relaxed = shortNights(schedule({ wakeTimes: { wed: '09:00' } }))
    expect(relaxed).toEqual([])
  })

  it('reads the alarm of the *next* day, not the same one', () => {
    // Tuesday evening is decided by Wednesday morning. A Tuesday wake time
    // says nothing about it.
    expect(shortNights(schedule({ wakeTimes: { tue: '05:00' } }))).toEqual([])
    expect(nextWeekday('tue')).toBe('wed')
    expect(nextWeekday('sun')).toBe('mon')
  })
})

describe('what the plan does with it', () => {
  const base = makeInput(PROFILES[3], GOALS[1])

  // A late shift, not football, on purpose. A sport commitment already takes
  // its day out of the training rota — "no second session on the day you
  // already play" — so testing the night rule with football would pass whether
  // the night rule existed or not.
  //
  // It ends at 21:00 and the Tuesday slot starts at 21:00, so the slot is
  // genuinely free time: what removes it is the night, nothing else.
  const lateShift: Commitment = {
    label: 'Spätschicht',
    weekday: 'tue',
    start: '13:00',
    minutes: 480,
    kind: 'work',
    activity: null,
  }

  const slots = [
    { weekday: 'tue' as const, start: '21:00', minutes: 60 },
    { weekday: 'thu' as const, start: '19:00', minutes: 60 },
    { weekday: 'sat' as const, start: '10:00', minutes: 90 },
  ]

  const withNight = (wake: string) => ({
    ...base,
    schedule: { ...base.schedule, freeSlots: slots, commitments: [lateShift], wakeTimes: { wed: wake } },
  })

  const tuesdaysIn = (input: Parameters<typeof generatePlan>[0]) =>
    generatePlan(input).items.filter((i) => weekdayOf(i.scheduledOn) === 'tue')

  it('plans nothing into an evening the night has already taken', () => {
    expect(tuesdaysIn(withNight('05:00'))).toEqual([])

    // And it really is the night doing it: the same week with a later alarm
    // gets its Tuesday back.
    expect(tuesdaysIn(withNight('09:00')).length).toBeGreaterThan(0)
  })

  it('takes one evening, not the week', () => {
    const plan = generatePlan(withNight('05:00'))
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.items.some((i) => weekdayOf(i.scheduledOn) === 'thu')).toBe(true)
  })

  it('keeps a morning on the same day, because it costs the night nothing', () => {
    const morning = {
      ...base,
      schedule: {
        ...base.schedule,
        freeSlots: [{ weekday: 'tue' as const, start: '07:00', minutes: 60 }, ...slots.slice(1)],
        commitments: [lateShift],
        wakeTimes: { wed: '05:00' },
      },
    }
    expect(tuesdaysIn(morning).length).toBeGreaterThan(0)
  })

  it('says why, in the plan the user reads', () => {
    const explanation = generatePlan(withNight('05:00')).rationale.find((r) =>
      r.basedOn.includes('schedule.wakeTimes'),
    )
    expect(explanation).toBeDefined()
    expect(explanation?.text).toContain('Spätschicht')
    expect(explanation?.text).toContain('21:00')
    expect(explanation?.text).toContain('05:00')
    // No verdict on the person: this is arithmetic about a night.
    expect(explanation?.text.toLowerCase()).not.toMatch(/motivier|diszipl|solltest du|faul/)
  })

  it('stays quiet when the plan has room anyway', () => {
    const plan = generatePlan(withNight('09:00'))
    expect(plan.rationale.some((r) => r.basedOn.includes('schedule.wakeTimes'))).toBe(false)
    expect(MIN_NIGHT_HOURS).toBe(7)
  })
})
