// Structural fingerprint of a plan.
//
// Feeds two gates: the personalisation gate (different people, different plans)
// and the goal-orientation gate (same person, different goals, different plans).
// Deliberately structural — times of day and free text are excluded, because a
// test that compared those would pass even when every plan is essentially the
// same. See critique K7 and ADR-014.

import type { PlanResult, PlannedItem, TimeSlot } from '@/lib/domain/types'

/**
 * The shared features every plan has, plus the archetype's own. Archetype
 * features are namespaced so two goal types never collide on a key.
 */
export type PlanSignature = Record<string, string>

export const SHARED_FEATURES = [
  'archetype',
  'goalItemCount',
  'baselineItemCount',
  'domains',
  'activeDays',
  'timeOfDayPattern',
] as const

export function planSignature(plan: PlanResult): PlanSignature {
  const goalItems = plan.items.filter((i) => i.track === 'goal')
  const baselineItems = plan.items.filter((i) => i.track === 'baseline')

  const shared: PlanSignature = {
    archetype: plan.strategy.archetype,
    goalItemCount: bucketCount(goalItems.length),
    baselineItemCount: bucketCount(baselineItems.length),
    domains: [...new Set(plan.items.map((i) => i.domain))].sort().join('+'),
    activeDays: String(new Set(plan.items.map((i) => i.scheduledOn)).size),
    timeOfDayPattern: timeOfDayPattern(plan.items),
  }

  for (const [key, value] of Object.entries(plan.strategy.goalTrack.signature)) {
    shared[`goal.${key}`] = value
  }

  return shared
}

/**
 * Share of features that differ, over the union of both signatures' keys.
 * Two plans from different archetypes have disjoint goal features, which
 * correctly reads as a large distance — they really are different plans.
 */
export function signatureDistance(a: PlanSignature, b: PlanSignature): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  if (keys.size === 0) return 0
  let differing = 0
  for (const key of keys) {
    if (a[key] !== b[key]) differing++
  }
  return differing / keys.size
}

function bucketCount(n: number): string {
  if (n === 0) return '0'
  if (n <= 3) return '1-3'
  if (n <= 7) return '4-7'
  if (n <= 12) return '8-12'
  return '13+'
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

export function describePlan(plan: PlanResult): string {
  const s = plan.strategy
  return [
    `[${s.archetype}] ${s.goalTrack.headline}`,
    `· ${plan.items.filter((i) => i.track === 'goal').length} Ziel-Aktionen`,
    `+ ${plan.items.filter((i) => i.track === 'baseline').length} Basis`,
  ].join(' ')
}
