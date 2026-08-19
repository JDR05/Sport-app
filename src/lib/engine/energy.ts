// Energy calculations. Deterministic, tested, and never delegated to a model:
// a wrong number here becomes a wrong calorie target for a real person.

import {
  ACTIVITY_FACTOR,
  BASAL_RATE,
  FALLBACK,
  INTAKE_FLOOR_KCAL,
  MAX_DEFICIT_SHARE,
} from './constants'
import type { Assumption, Profile, Schedule, SexAtBirth } from '@/lib/domain/types'

export type EnergyInput = {
  profile: Profile
  schedule: Schedule
  weightKg: number
  today: string
  sessionsPerWeek: number
}

export type EnergyResult = {
  basalRateKcal: number
  activityFactor: number
  dailyNeedKcal: number
  intakeFloorKcal: number
  assumptions: Assumption[]
}

export function resolvedSex(profile: Profile): SexAtBirth {
  return profile.sexAtBirth ?? FALLBACK.sexAtBirth
}

export function intakeFloor(profile: Profile): number {
  return INTAKE_FLOOR_KCAL[resolvedSex(profile)]
}

/**
 * Mifflin-St Jeor. `unspecified` uses the male offset because it is the higher
 * of the two: a higher estimated need means a less restrictive plan.
 */
export function basalRate(args: {
  weightKg: number
  heightCm: number
  ageYears: number
  sex: SexAtBirth
}): number {
  const { weightFactor, heightFactor, ageFactor, offset } = BASAL_RATE
  const base =
    weightFactor * args.weightKg +
    heightFactor * args.heightCm -
    ageFactor * args.ageYears
  return base + (args.sex === 'female' ? offset.female : offset.male)
}

export function activityFactor(schedule: Schedule, sessionsPerWeek: number): number {
  const sedentaryWork = schedule.workPattern === 'office' || schedule.workPattern === 'remote'
  if (sessionsPerWeek >= 5) return ACTIVITY_FACTOR.high
  if (sessionsPerWeek >= 3) return sedentaryWork ? ACTIVITY_FACTOR.light : ACTIVITY_FACTOR.moderate
  if (sessionsPerWeek >= 1) return sedentaryWork ? ACTIVITY_FACTOR.sedentary : ACTIVITY_FACTOR.light
  return ACTIVITY_FACTOR.sedentary
}

export function computeEnergy(input: EnergyInput): EnergyResult {
  const assumptions: Assumption[] = []
  const { profile, schedule, weightKg, today, sessionsPerWeek } = input

  let ageYears: number
  if (profile.birthYear === null) {
    ageYears = FALLBACK.age
    assumptions.push({
      field: 'profile.birthYear',
      assumed: `${FALLBACK.age} Jahre`,
      reason: 'Kein Geburtsjahr angegeben. Der angenommene Wert liegt auf der sicheren Seite, weil er den geschätzten Bedarf eher erhöht als senkt.',
    })
  } else {
    ageYears = Number(today.slice(0, 4)) - profile.birthYear
  }

  let heightCm: number
  if (profile.heightCm === null) {
    heightCm = FALLBACK.heightCm
    assumptions.push({
      field: 'profile.heightCm',
      assumed: `${FALLBACK.heightCm} cm`,
      reason: 'Keine Körpergröße angegeben. Der angenommene Wert erhöht den geschätzten Bedarf leicht, statt ihn zu senken.',
    })
  } else {
    heightCm = profile.heightCm
  }

  if (profile.sexAtBirth === null) {
    assumptions.push({
      field: 'profile.sexAtBirth',
      assumed: 'nicht angegeben',
      reason: 'Ohne Angabe rechnet die App mit der Variante, die zu mehr Essen führt, und setzt gleichzeitig die höhere Kaloriengrenze.',
    })
  }

  const basal = basalRate({ weightKg, heightCm, ageYears, sex: resolvedSex(profile) })
  const factor = activityFactor(schedule, sessionsPerWeek)

  return {
    basalRateKcal: Math.round(basal),
    activityFactor: factor,
    dailyNeedKcal: Math.round(basal * factor),
    intakeFloorKcal: intakeFloor(profile),
    assumptions,
  }
}

/**
 * Applies both caps: the deficit may not exceed a share of the daily need, and
 * the resulting intake may not fall below the absolute floor.
 */
export function targetIntake(args: {
  dailyNeedKcal: number
  desiredDeficitKcal: number
  floorKcal: number
}): { targetIntakeKcal: number; deficitKcal: number; cappedBy: 'none' | 'share' | 'floor' } {
  const shareCap = args.dailyNeedKcal * MAX_DEFICIT_SHARE
  let cappedBy: 'none' | 'share' | 'floor' = 'none'

  let deficit = args.desiredDeficitKcal
  if (deficit > shareCap) {
    deficit = shareCap
    cappedBy = 'share'
  }

  let intake = args.dailyNeedKcal - deficit
  if (intake < args.floorKcal) {
    intake = args.floorKcal
    deficit = args.dailyNeedKcal - intake
    cappedBy = 'floor'
  }

  return {
    targetIntakeKcal: Math.round(intake),
    deficitKcal: Math.round(deficit),
    cappedBy,
  }
}
