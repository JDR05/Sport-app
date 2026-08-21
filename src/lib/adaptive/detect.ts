// Schritt 1 of the cycle: find repeated shortfalls, or find nothing.
//
// The default outcome of this module is an empty array. A single deviation is
// not a pattern, a quiet week is not a failure, and an untracked day is not
// evidence of anything. Every threshold that guards that is in ./constants.

import {
  LONG_SESSION_MINUTES,
  MIN_CONTRAST,
  MIN_DISTINCT_WEEKS,
  MIN_MISSES,
  MIN_MISS_RATE,
  MIN_RESOLVED_INSTANCES,
} from './constants'
import type { Deviation, DeviationDimension, Observation } from './types'
import { startOfWeek, weekdayOf } from '@/lib/engine/dates'
import type { PlanDomain } from '@/lib/domain/types'

/**
 * Statuses that carry behavioural information.
 *
 * `unknown` is missing input, not a miss — without this line, tracking fatigue
 * manufactures patterns and the app talks the user into a problem they do not
 * have. `not_relevant` is a planning error and belongs to plan care, not to
 * pattern detection. `planned` has not happened yet. All three are excluded
 * from the denominator, so they cannot dilute a rate either.
 */
const COMPLIED: readonly string[] = ['done', 'moved']
const MISSED = 'missed'

function isResolved(o: Observation): boolean {
  return o.status === MISSED || COMPLIED.includes(o.status)
}

/**
 * Every deviation the data supports, strongest contrast first. Returns `[]`
 * when the thresholds are not met — and then nothing at all is shown to the
 * user. Premature intervention is the fastest way to lose their trust.
 */
export function detectDeviations(observations: Observation[]): Deviation[] {
  const resolved = observations.filter(isResolved)
  if (resolved.length < MIN_RESOLVED_INSTANCES) return []

  const found: Deviation[] = []
  for (const dimension of ['weekday', 'time_slot', 'duration', 'domain'] as const) {
    found.push(...detectAlong(dimension, resolved))
  }

  return found.sort((a, b) => contrast(b) - contrast(a))
}

function contrast(d: Deviation): number {
  return d.missRate - d.comparisonMissRate
}

function detectAlong(dimension: DeviationDimension, resolved: Observation[]): Deviation[] {
  const buckets = new Map<string, Observation[]>()
  for (const o of resolved) {
    const key = bucketOf(dimension, o)
    if (key === null) continue
    const list = buckets.get(key) ?? []
    list.push(o)
    buckets.set(key, list)
  }

  // A single bucket has nothing to be worse than. Comparing it against itself
  // would turn "this person misses a lot" into "Wednesdays are the problem".
  if (buckets.size < 2) return []

  const out: Deviation[] = []
  for (const [bucket, inBucket] of buckets) {
    // Only observations that *have* a value on this axis may be compared
    // against one that does. An item with no time of day was already left out
    // of bucket formation above; letting it into the comparison denominator
    // meant the daily routines — which mostly succeed and carry no slot and no
    // duration — were counted as evidence that other times of day go better.
    //
    // Every plan mixes timed sessions with untimed daily routines, so this was
    // the normal case, not an edge one: it manufactured contrast out of nothing
    // and could report two mutually contradictory findings from the same week.
    const rest = resolved.filter((o) => {
      const key = bucketOf(dimension, o)
      return key !== null && key !== bucket
    })
    const deviation = assess(dimension, bucket, inBucket, rest)
    if (deviation) out.push(deviation)
  }
  return out
}

function assess(
  dimension: DeviationDimension,
  bucket: string,
  inBucket: Observation[],
  rest: Observation[],
): Deviation | null {
  if (inBucket.length < MIN_RESOLVED_INSTANCES) return null

  const missedItems = inBucket.filter((o) => o.status === MISSED)
  if (missedItems.length < MIN_MISSES) return null

  const missRate = missedItems.length / inBucket.length
  if (missRate < MIN_MISS_RATE) return null

  const comparisonMissRate =
    rest.length === 0 ? 0 : rest.filter((o) => o.status === MISSED).length / rest.length
  if (missRate - comparisonMissRate < MIN_CONTRAST) return null

  // The misses themselves have to span weeks, not just the observations around
  // them. Four misses inside one bad week are one bad week.
  const weeks = new Set(missedItems.map((o) => startOfWeek(o.scheduledOn)))
  if (weeks.size < MIN_DISTINCT_WEEKS) return null

  const domains = new Set(inBucket.map((o) => o.domain))

  return {
    dimension,
    bucket,
    domain: domains.size === 1 ? ([...domains][0] as PlanDomain) : null,
    resolved: inBucket.length,
    missed: missedItems.length,
    missRate: round2(missRate),
    comparisonMissRate: round2(comparisonMissRate),
    distinctWeeks: weeks.size,
    evidence: missedItems.map((o) => o.itemId),
  }
}

function bucketOf(dimension: DeviationDimension, o: Observation): string | null {
  switch (dimension) {
    case 'weekday':
      return weekdayOf(o.scheduledOn)
    case 'time_slot':
      return o.timeSlot
    case 'domain':
      return o.domain
    case 'duration':
      if (o.plannedDurationMin === null) return null
      return o.plannedDurationMin >= LONG_SESSION_MINUTES ? 'long' : 'short'
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Items the user marked `not_relevant`: the plan asked for something that does
 * not apply to their life. That is a planning error to be corrected quietly by
 * plan care, never a behavioural pattern. Separated here so no caller can
 * accidentally feed them into detection.
 */
export function planningErrors(observations: Observation[]): Observation[] {
  return observations.filter((o) => o.status === 'not_relevant')
}

/** Share of resolved items completed. The behaviour metric everything is judged on. */
export function completionRate(observations: Observation[]): number | null {
  const resolved = observations.filter(isResolved)
  if (resolved.length === 0) return null
  return round2(resolved.filter((o) => o.status !== MISSED).length / resolved.length)
}

export { isResolved }
