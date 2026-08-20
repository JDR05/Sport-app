// The seam where stored JSON becomes a typed profile.
//
// Postgres guarantees these columns are objects. It does not guarantee that
// `sessionsPerWeekTarget` is a number, that `experience` is one of three
// words, or that a row written by last month's onboarding still matches this
// month's shape. Every one of those is a crash on the Today screen if the
// parse is optimistic.
//
// The rule these tests pin down: an unreadable answer becomes a *missing*
// answer, never an exception. The engine already knows what to do with
// missing — it records an assumption and plans anyway.

import { describe, expect, it } from 'vitest'
import {
  readConstraintValue, readFreeSlots, readMind, readNutrition,
  readSexAtBirth, readSleep, readSport, readWorkPattern,
} from '@/lib/db/schemas'
import { generatePlan } from '@/lib/engine'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'

const JUNK = [
  null, undefined, 0, '', 'nope', [], true,
  { sessionsPerWeekTarget: 'drei' },
  { experience: 'jedi' },
  { preferredActivities: 'gym' },
  { preferredActivities: ['gym', 'quidditch'] },
  { quality: null, wakesAtNight: 'ja' },
  { screenTimeHoursPerDay: -5 },
  { existingRoutines: [1, 2, 3] },
]

describe('a profile block that cannot be read', () => {
  it('never throws, whatever is in the column', () => {
    for (const value of JUNK) {
      expect(() => readSport(value), JSON.stringify(value)).not.toThrow()
      expect(() => readNutrition(value), JSON.stringify(value)).not.toThrow()
      expect(() => readSleep(value), JSON.stringify(value)).not.toThrow()
      expect(() => readMind(value), JSON.stringify(value)).not.toThrow()
    }
  })

  it('turns an unreadable answer into a missing one', () => {
    expect(readSport({ sessionsPerWeekTarget: 'drei' }).sessionsPerWeekTarget).toBeNull()
    expect(readSport({ experience: 'jedi' }).experience).toBeNull()
    expect(readSleep({ quality: 'fantastisch' }).quality).toBeNull()
    expect(readMind({ focusStruggle: 7 }).focusStruggle).toBeNull()
  })

  it('keeps the answers it can read next to the ones it cannot', () => {
    // Losing a whole block because one field is wrong would throw away good
    // data. Partial understanding is the useful outcome here.
    const sport = readSport({ experience: 'advanced', sessionsPerWeekTarget: 'viele' })
    expect(sport.experience).toBe('advanced')
    expect(sport.sessionsPerWeekTarget).toBeNull()
  })

  it('returns empty lists rather than undefined', () => {
    for (const value of JUNK) {
      expect(Array.isArray(readSport(value).preferredActivities)).toBe(true)
      expect(Array.isArray(readMind(value).existingRoutines)).toBe(true)
    }
  })
})

describe('free slots', () => {
  it('drops the ones that do not parse and keeps the rest', () => {
    const slots = readFreeSlots([
      { weekday: 'mon', start: '18:00', minutes: 60 },
      { weekday: 'funday', start: '18:00', minutes: 60 },
      { weekday: 'tue', start: '25:00', minutes: 60 },
      { weekday: 'wed', start: '07:30', minutes: 45 },
      'nonsense',
    ])
    expect(slots).toEqual([
      { weekday: 'mon', start: '18:00', minutes: 60 },
      { weekday: 'wed', start: '07:30', minutes: 45 },
    ])
  })

  it('is an empty list for anything that is not an array', () => {
    for (const value of [null, undefined, {}, 'mon']) {
      expect(readFreeSlots(value)).toEqual([])
    }
  })
})

describe('constraints', () => {
  it('reads the four shapes the engine understands', () => {
    expect(readConstraintValue({ type: 'no_training_on', weekdays: ['mon'] })).not.toBeNull()
    expect(readConstraintValue({ type: 'max_session_minutes', minutes: 30 })).not.toBeNull()
    expect(readConstraintValue({ type: 'no_activity', activity: 'running' })).not.toBeNull()
    expect(readConstraintValue({ type: 'dietary', pattern: 'vegan' })).not.toBeNull()
  })

  it('drops a constraint it cannot interpret rather than half-keeping it', () => {
    // A hard constraint the engine does not understand is worse than none: it
    // looks respected while it is being ignored.
    expect(readConstraintValue({ type: 'no_training_on', weekdays: ['someday'] })).toBeNull()
    expect(readConstraintValue({ type: 'teleport', to: 'mars' })).toBeNull()
    expect(readConstraintValue(null)).toBeNull()
  })
})

describe('scalars', () => {
  it('accepts only the known values', () => {
    expect(readWorkPattern('shift')).toBe('shift')
    expect(readWorkPattern('freelance')).toBeNull()
    expect(readSexAtBirth('female')).toBe('female')
    expect(readSexAtBirth('f')).toBeNull()
  })
})

describe('a profile stored as complete garbage', () => {
  it('still produces a valid plan', () => {
    // The end-to-end promise: a corrupt row degrades the plan, it does not
    // take the app down.
    const input = makeInput(PROFILES[0], GOALS[0])
    const wrecked = {
      ...input,
      profile: {
        ...input.profile,
        sport: readSport('nonsense'),
        nutrition: readNutrition(42),
        sleep: readSleep([]),
        mind: readMind(null),
      },
      schedule: { workPattern: readWorkPattern('???'), freeSlots: readFreeSlots('???') },
    }

    const plan = generatePlan(wrecked)
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.assumptions.length).toBeGreaterThan(0)
  })
})
