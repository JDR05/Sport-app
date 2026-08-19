// Structural fingerprint of a plan.
//
// Used by the personalisation gate, and later by the adaptive engine to compare
// a plan before and after an experiment. Deliberately structural: times of day
// and free text are excluded, because a test that compared those would pass even
// when ten profiles get essentially the same plan. See critique K7 and ADR-014.

import type { PlanResult, PlannedItem, TimeSlot, WeekStrategy } from '@/lib/domain/types'

export type PlanSignature = {
  sessionsBucket: string
  trainingDayPattern: string
  modality: string
  sessionLengthBucket: string
  nutritionApproach: string
  nutritionActionCount: string
  movementApproach: string
  intakeBucket: string
  deficitTier: string
  timeOfDayPattern: string
}

/** The ten features, in a fixed order. */
export const SIGNATURE_FEATURES: readonly (keyof PlanSignature)[] = [
  'sessionsBucket',
  'trainingDayPattern',
  'modality',
  'sessionLengthBucket',
  'nutritionApproach',
  'nutritionActionCount',
  'movementApproach',
  'intakeBucket',
  'deficitTier',
  'timeOfDayPattern',
] as const

export function planSignature(plan: PlanResult): PlanSignature {
  const s = plan.strategy
  return {
    sessionsBucket: sessionsBucket(s.trainingSessions),
    trainingDayPattern: s.trainingWeekdays.join('-') || 'none',
    modality: s.trainingModality,
    sessionLengthBucket: sessionLengthBucket(s.sessionMinutes),
    nutritionApproach: s.nutritionApproach,
    nutritionActionCount: String(plan.items.filter((i) => i.domain === 'nutrition').length),
    movementApproach: s.movementApproach,
    intakeBucket: intakeBucket(s.targetIntakeKcal),
    deficitTier: s.deficitTier,
    timeOfDayPattern: timeOfDayPattern(plan.items),
  }
}

/** Share of the ten features that differ. 0 = identical, 1 = nothing in common. */
export function signatureDistance(a: PlanSignature, b: PlanSignature): number {
  const differing = SIGNATURE_FEATURES.filter((f) => a[f] !== b[f]).length
  return differing / SIGNATURE_FEATURES.length
}

function sessionsBucket(sessions: number): string {
  if (sessions === 0) return '0'
  if (sessions <= 2) return '1-2'
  if (sessions <= 4) return '3-4'
  return '5+'
}

function sessionLengthBucket(minutes: number): string {
  if (minutes <= 30) return '<=30'
  if (minutes <= 50) return '31-50'
  return '>50'
}

function intakeBucket(kcal: number): string {
  return String(Math.floor(kcal / 250) * 250)
}

function timeOfDayPattern(items: PlannedItem[]): string {
  const slots = new Set<TimeSlot>()
  for (const item of items) {
    if (item.timeSlot) slots.add(item.timeSlot)
  }
  if (slots.size === 0) return 'none'
  if (slots.size > 1) return 'mixed'
  return [...slots][0]
}

export function describeStrategy(s: WeekStrategy): string {
  return [
    `${s.trainingSessions}× ${s.trainingModality} à ${s.sessionMinutes} min`,
    `(${s.trainingWeekdays.join(', ') || 'kein Training'})`,
    `· ${s.targetIntakeKcal} kcal, −${s.deficitKcal} (${s.deficitTier})`,
    `· ${s.nutritionApproach} · ${s.movementApproach}`,
  ].join(' ')
}
