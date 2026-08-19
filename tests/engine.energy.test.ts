import { describe, expect, it } from 'vitest'
import { activityFactor, basalRate, computeEnergy, intakeFloor, targetIntake } from '@/lib/engine/energy'
import { INTAKE_FLOOR_KCAL, MAX_DEFICIT_SHARE } from '@/lib/engine/constants'
import type { Profile, Schedule } from '@/lib/domain/types'

const emptySchedule: Schedule = {
  wakeTime: null, sleepTime: null, workPattern: null, freeSlots: [], weekendDiffers: false,
}

function profileWith(over: Partial<Profile>): Profile {
  return {
    birthYear: 1996, heightCm: 180, sexAtBirth: 'male', lifeSituation: null,
    sport: {
      preferredActivities: [], dislikedActivities: [], sessionsPerWeekTarget: null,
      preferredSessionMinutes: null, equipment: ['none'], experience: 'beginner',
    },
    nutrition: {
      cooksAtHome: 'sometimes', timeForCookingMin: 30, eatsOutPerWeek: 2,
      dietaryPattern: 'omnivore', mealsPerDay: 3,
    },
    ...over,
  }
}

describe('basalRate', () => {
  it('matches Mifflin-St Jeor computed by hand', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(basalRate({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male' })).toBe(1780)
    // same body, female offset: 800 + 1125 - 150 - 161
    expect(basalRate({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'female' })).toBe(1614)
  })

  it('treats unspecified sex as the higher of the two variants', () => {
    const unspecified = basalRate({ weightKg: 70, heightCm: 170, ageYears: 35, sex: 'unspecified' })
    const male = basalRate({ weightKg: 70, heightCm: 170, ageYears: 35, sex: 'male' })
    const female = basalRate({ weightKg: 70, heightCm: 170, ageYears: 35, sex: 'female' })
    expect(unspecified).toBe(male)
    expect(unspecified).toBeGreaterThan(female)
  })
})

describe('intakeFloor', () => {
  it('gives an unspecified sex the higher floor', () => {
    expect(intakeFloor(profileWith({ sexAtBirth: null }))).toBe(INTAKE_FLOOR_KCAL.male)
    expect(intakeFloor(profileWith({ sexAtBirth: 'female' }))).toBe(INTAKE_FLOOR_KCAL.female)
    expect(INTAKE_FLOOR_KCAL.male).toBeGreaterThan(INTAKE_FLOOR_KCAL.female)
  })
})

describe('activityFactor', () => {
  it('rises with training volume', () => {
    const none = activityFactor(emptySchedule, 0)
    const some = activityFactor(emptySchedule, 2)
    const lots = activityFactor(emptySchedule, 5)
    expect(some).toBeGreaterThan(none)
    expect(lots).toBeGreaterThan(some)
  })

  it('is lower for sedentary work at the same training volume', () => {
    const office = activityFactor({ ...emptySchedule, workPattern: 'office' }, 3)
    const shift = activityFactor({ ...emptySchedule, workPattern: 'shift' }, 3)
    expect(office).toBeLessThan(shift)
  })
})

describe('computeEnergy', () => {
  it('records an assumption for every missing input rather than failing', () => {
    const result = computeEnergy({
      profile: profileWith({ birthYear: null, heightCm: null, sexAtBirth: null }),
      schedule: emptySchedule,
      weightKg: 80,
      today: '2026-08-19',
      sessionsPerWeek: 2,
    })
    const fields = result.assumptions.map((a) => a.field)
    expect(fields).toContain('profile.birthYear')
    expect(fields).toContain('profile.heightCm')
    expect(fields).toContain('profile.sexAtBirth')
    expect(result.dailyNeedKcal).toBeGreaterThan(0)
  })

  it('does not invent assumptions when everything is supplied', () => {
    const result = computeEnergy({
      profile: profileWith({}),
      schedule: emptySchedule,
      weightKg: 80,
      today: '2026-08-19',
      sessionsPerWeek: 2,
    })
    expect(result.assumptions).toHaveLength(0)
  })
})

describe('targetIntake', () => {
  it('caps the deficit at a share of the daily need', () => {
    const r = targetIntake({ dailyNeedKcal: 2000, desiredDeficitKcal: 1500, floorKcal: 1200 })
    expect(r.deficitKcal).toBe(2000 * MAX_DEFICIT_SHARE)
    expect(r.cappedBy).toBe('share')
  })

  it('never returns an intake below the floor', () => {
    const r = targetIntake({ dailyNeedKcal: 1400, desiredDeficitKcal: 600, floorKcal: 1200 })
    expect(r.targetIntakeKcal).toBe(1200)
    expect(r.cappedBy).toBe('floor')
  })

  it('leaves a modest deficit untouched', () => {
    const r = targetIntake({ dailyNeedKcal: 2600, desiredDeficitKcal: 400, floorKcal: 1500 })
    expect(r.deficitKcal).toBe(400)
    expect(r.targetIntakeKcal).toBe(2200)
    expect(r.cappedBy).toBe('none')
  })
})
