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
  // The health basis runs beside every goal, and it is not the same basis for
  // everyone: a sedentary week gets walk breaks where an active one gets a step
  // count, and someone sleeping badly is asked to observe their nights before
  // being asked to hold a bedtime. The plan already made those choices and
  // recorded them; the signature simply was not looking, which is why two very
  // different people could come out identical under a baseline-only goal.
  'baselineMovement',
  'baselineSleep',
  'baselineNutrition',
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
    baselineMovement: baselineMovement(plan.items),
    baselineSleep: baselineSleep(plan.items),
    baselineNutrition: baselineNutrition(plan.items),
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

/**
 * When the plan actually happens, as the person would describe it.
 *
 * This used to return 'mixed' the moment two different slots appeared anywhere
 * in the plan — including the baseline, which spans the day by design. Almost
 * every plan was therefore 'mixed', and a feature with one value distinguishes
 * nothing: it was taking up a slot in the signature while contributing no
 * information to the personalisation gate.
 *
 * Now it reads the goal track, which is the part someone experiences as "mine
 * is a morning plan", and 'mixed' means genuinely mixed — no slot holding a
 * majority — rather than "more than one exists". Note this makes the gate
 * harder, not easier: a plan that is honestly all-evening now has to differ
 * from another all-evening plan somewhere else.
 */
function timeOfDayPattern(items: PlannedItem[]): string {
  const goalSlots = items
    .filter((i) => i.track === 'goal')
    .map((i) => i.timeSlot)
    .filter((s): s is TimeSlot => s !== null)

  // A goal track with no times of its own — a nutrition or habit week — is
  // described by whatever the plan does carry.
  const slots =
    goalSlots.length > 0
      ? goalSlots
      : items.map((i) => i.timeSlot).filter((s): s is TimeSlot => s !== null)

  if (slots.length === 0) return 'none'

  const counts = new Map<TimeSlot, number>()
  for (const slot of slots) counts.set(slot, (counts.get(slot) ?? 0) + 1)

  const [dominant, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return count * 2 > slots.length ? dominant : 'mixed'
}

/**
 * How the basis keeps someone moving: a daily step count, or walk breaks.
 *
 * Read off the item the engine already wrote rather than re-derived from the
 * profile — the signature describes the plan, not its input, or the
 * personalisation gate would be measuring how different the people are instead
 * of how different their plans came out.
 */
function baselineMovement(items: PlannedItem[]): string {
  const movement = items.find((i) => i.track === 'baseline' && i.domain === 'movement')
  if (!movement) return 'none'
  const steps = movement.details?.steps
  return typeof steps === 'number' ? `steps-${Math.round(steps / 2000) * 2000}` : 'breaks'
}

/** Whether the basis holds a bedtime or first asks the person to watch one. */
function baselineSleep(items: PlannedItem[]): string {
  const sleep = items.find((i) => i.track === 'baseline' && i.domain === 'sleep')
  if (!sleep) return 'none'
  const mode = sleep.details?.mode
  return typeof mode === 'string' ? mode : 'other'
}

/** Which additive eating habit the basis chose for this person. */
function baselineNutrition(items: PlannedItem[]): string {
  const nutrition = items.find((i) => i.track === 'baseline' && i.domain === 'nutrition')
  if (!nutrition) return 'none'
  const focus = nutrition.details?.focus
  return typeof focus === 'string' ? focus : 'other'
}

export function describePlan(plan: PlanResult): string {
  const s = plan.strategy
  return [
    `[${s.archetype}] ${s.goalTrack.headline}`,
    `· ${plan.items.filter((i) => i.track === 'goal').length} Ziel-Aktionen`,
    `+ ${plan.items.filter((i) => i.track === 'baseline').length} Basis`,
  ].join(' ')
}
