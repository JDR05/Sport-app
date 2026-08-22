// Changing a goal must not cost someone their setup.
//
// The form started empty every time. That is right for a first goal and
// destructive for a second: "Ziel wechseln" opened a blank intake, and
// submitting it replaced free slots, commitments, wake times, hard constraints
// and every profile answer with whatever the blank draft still held. Someone
// who changed their goal and used "Rest überspringen" lost the football
// training the night rule depends on, the days they had blocked, and their
// equipment — silently, because the write itself succeeded.
//
// So the mapping has to run both ways, and a round trip has to come back
// unchanged. That is what this file holds it to.

import { describe, expect, it } from 'vitest'
import { EMPTY, SLOT_START, toDraft } from '@/app/onboarding/draft'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import type { StoredPlanInput } from '@/lib/db/plan-input'
import type { Commitment, Weekday } from '@/lib/domain/types'

/** A stored intake, the way loadPlanInput hands it over. */
function stored(profileIndex = 3, goalIndex = 0): StoredPlanInput {
  const input = makeInput(PROFILES[profileIndex], GOALS[goalIndex])
  return {
    profile: input.profile,
    goal: input.goal,
    metrics: input.metrics,
    constraints: input.constraints,
    schedule: input.schedule,
    personalRules: input.personalRules,
    aiProposal: input.aiProposal,
  }
}

const football: Commitment = {
  label: 'Fußballtraining',
  weekday: 'tue',
  start: '19:00',
  minutes: 120,
  kind: 'sport',
  activity: 'football',
}

describe('what a goal change must not lose', () => {
  it('keeps the commitments the night rule depends on', () => {
    const input = stored()
    const withFootball: StoredPlanInput = {
      ...input,
      schedule: { ...input.schedule, commitments: [football] },
    }
    expect(toDraft(withFootball).commitments).toEqual([football])
  })

  it('keeps the per-weekday wake times', () => {
    const input = stored()
    const withWake: StoredPlanInput = {
      ...input,
      schedule: { ...input.schedule, wakeTimes: { wed: '05:00', sat: '09:30' } },
    }
    expect(toDraft(withWake).wakeTimes).toEqual({ wed: '05:00', sat: '09:30' })
  })

  it('keeps the days that were blocked as a hard constraint', () => {
    const input = stored()
    const blocked: StoredPlanInput = {
      ...input,
      constraints: [
        { kind: 'time', hard: true, value: { type: 'no_training_on', weekdays: ['wed', 'sun'] } },
      ],
    }
    expect(toDraft(blocked).blockedDays).toEqual(['wed', 'sun'])
  })

  it('keeps the free days and the slot they sit in', () => {
    const input = stored()
    const draft = toDraft(input)
    const days = new Set(input.schedule.freeSlots.map((s) => s.weekday))

    expect(draft.freeDays.length).toBe(days.size)
    for (const day of draft.freeDays) expect(days.has(day)).toBe(true)
    expect(draft.slotMinutes).toBe(input.schedule.freeSlots[0]?.minutes ?? null)
  })

  it.each(PROFILES.map((p, i) => ({ name: p.name, index: i })))(
    '$name: keeps every profile answer',
    ({ index }) => {
      const input = stored(index)
      const draft = toDraft(input)

      expect(draft.birthYear).toBe(input.profile.birthYear)
      expect(draft.heightCm).toBe(input.profile.heightCm)
      expect(draft.weightKg).toBe(input.profile.weightKg)
      expect(draft.sexAtBirth).toBe(input.profile.sexAtBirth)
      expect(draft.experience).toBe(input.profile.sport.experience)
      expect(draft.sessionsPerWeekTarget).toBe(input.profile.sport.sessionsPerWeekTarget)
      expect(draft.preferredActivities).toEqual(input.profile.sport.preferredActivities)
      expect(draft.dislikedActivities).toEqual(input.profile.sport.dislikedActivities)
      expect(draft.cooksAtHome).toBe(input.profile.nutrition.cooksAtHome)
      expect(draft.dietaryPattern).toBe(input.profile.nutrition.dietaryPattern)
      expect(draft.usualBedtime).toBe(input.profile.sleep.usualBedtime)
      expect(draft.sleepQuality).toBe(input.profile.sleep.quality)
      expect(draft.workPattern).toBe(input.schedule.workPattern)
    },
  )
})

describe('what it deliberately does not carry over', () => {
  it('leaves the goal text empty', () => {
    // Someone here to redefine their goal is here to write a new one.
    // Pre-filling the old text invites submitting it again by accident, which
    // would retire a goal and replace it with a copy of itself.
    const draft = toDraft(stored())
    expect(draft.goalText).toBe('')
    expect(draft.archetype).toBeNull()
    expect(draft.targetDate).toBeNull()
    expect(draft.metricStart).toBeNull()
    expect(draft.metricTarget).toBeNull()
  })

  it('does not read the "none" placeholder back as chosen equipment', () => {
    // The payload writes ['none'] when nobody picked anything, so it is an
    // absence rather than an answer.
    const input = stored()
    const noEquipment: StoredPlanInput = {
      ...input,
      profile: { ...input.profile, sport: { ...input.profile.sport, equipment: ['none'] } },
    }
    expect(toDraft(noEquipment).equipment).toEqual([])
  })
})

describe('an intake that is mostly missing', () => {
  it('produces a draft rather than throwing', () => {
    const bare: StoredPlanInput = {
      ...stored(),
      constraints: [],
      schedule: { workPattern: null, freeSlots: [], commitments: [], wakeTimes: {} },
    }
    const draft = toDraft(bare)

    expect(draft.freeDays).toEqual([])
    expect(draft.slotTime).toBeNull()
    expect(draft.slotMinutes).toBeNull()
    expect(draft.blockedDays).toEqual([])
    expect(draft.commitments).toEqual([])
  })

  it('starts from EMPTY, so a field nobody stored stays unset', () => {
    const draft = toDraft(stored())
    for (const key of Object.keys(EMPTY)) {
      expect(draft).toHaveProperty(key)
    }
  })
})

describe('the slot band', () => {
  it.each(Object.entries(SLOT_START))('reads %s back from its start time', (band, start) => {
    const input = stored()
    const withBand: StoredPlanInput = {
      ...input,
      schedule: {
        ...input.schedule,
        freeSlots: [{ weekday: 'mon' as Weekday, start, minutes: 60 }],
      },
    }
    expect(toDraft(withBand).slotTime).toBe(band)
  })

  it('returns null for a start time the form cannot represent', () => {
    const input = stored()
    const odd: StoredPlanInput = {
      ...input,
      schedule: {
        ...input.schedule,
        freeSlots: [{ weekday: 'mon' as Weekday, start: '15:45', minutes: 60 }],
      },
    }
    expect(toDraft(odd).slotTime).toBeNull()
  })
})
