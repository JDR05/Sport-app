// The other half of detection, and the one the product was named after.
//
// Everything else in this layer looks for what is going wrong. That is
// necessary and it is also the whole reason a health app starts to feel like a
// second job: six weeks in, the only thing it has ever said about you is where
// you fall short. The brief calls the opposite the magic moment — the app
// tells you something true and good about yourself that you had not noticed,
// and can show you the days it came from.
//
// So this is the same machinery pointed the other way, with a deliberately
// higher bar. A shortfall is worth naming as soon as it is real, because a
// person can act on it. A strength is only worth naming when it is clearly
// there: "samstags läuft es bei dir gut" said about a coin flip is flattery,
// and flattery from a measuring instrument costs it everything.
//
// Never framed as a comparison to other people, and never as praise for
// effort. It is a statement about when this person's plan works.

import {
  MIN_CONTRAST,
  MIN_DISTINCT_WEEKS,
  MIN_RESOLVED_INSTANCES,
  MIN_STRENGTH_RATE,
} from './constants'
import { isResolved } from './detect'
import type { DeviationDimension, Observation } from './types'
import { startOfWeek, weekdayOf } from '@/lib/engine/dates'
import { LONG_SESSION_MINUTES } from './constants'
import type { PlanDomain } from '@/lib/domain/types'

export type Strength = {
  dimension: DeviationDimension
  /** The value of that dimension, e.g. 'sat' or 'early'. */
  bucket: string
  domain: PlanDomain | null
  resolved: number
  done: number
  rate: number
  /** Completion rate everywhere else along the same axis. */
  comparisonRate: number
  distinctWeeks: number
  /** Item ids the numbers came from — the days that actually worked. */
  evidence: string[]
}

const MISSED = 'missed'

/**
 * Every strength the data supports, strongest contrast first. `[]` is the
 * normal answer for the first weeks, and the screens show it as one.
 */
export function detectStrengths(observations: Observation[]): Strength[] {
  const resolved = observations.filter(isResolved)
  if (resolved.length < MIN_RESOLVED_INSTANCES) return []

  const found: Strength[] = []
  for (const dimension of ['weekday', 'time_slot', 'duration', 'domain'] as const) {
    found.push(...detectAlong(dimension, resolved))
  }

  return found.sort((a, b) => b.rate - b.comparisonRate - (a.rate - a.comparisonRate))
}

function detectAlong(dimension: DeviationDimension, resolved: Observation[]): Strength[] {
  const buckets = new Map<string, Observation[]>()
  for (const o of resolved) {
    const key = bucketOf(dimension, o)
    if (key === null) continue
    const list = buckets.get(key) ?? []
    list.push(o)
    buckets.set(key, list)
  }

  // A single bucket has nothing to be better than. Comparing it against itself
  // would turn "this person is doing well" into "Saturdays are your strength",
  // which is the same error detection makes in the other direction.
  if (buckets.size < 2) return []

  const out: Strength[] = []
  for (const [bucket, inBucket] of buckets) {
    // Same rule as detection: only observations that *have* a value on this
    // axis may be compared against one that does.
    const rest = resolved.filter((o) => {
      const key = bucketOf(dimension, o)
      return key !== null && key !== bucket
    })
    const strength = assess(dimension, bucket, inBucket, rest)
    if (strength) out.push(strength)
  }
  return out
}

function assess(
  dimension: DeviationDimension,
  bucket: string,
  inBucket: Observation[],
  rest: Observation[],
): Strength | null {
  if (inBucket.length < MIN_RESOLVED_INSTANCES) return null

  const doneItems = inBucket.filter((o) => o.status !== MISSED)
  const rate = doneItems.length / inBucket.length
  if (rate < MIN_STRENGTH_RATE) return null

  // Nothing to be better than. Someone who completes everything has no
  // strength on any particular axis — they simply do what they planned, and
  // telling them Saturdays are special would be inventing a distinction.
  if (rest.length === 0) return null

  const comparisonRate = rest.filter((o) => o.status !== MISSED).length / rest.length
  if (rate - comparisonRate < MIN_CONTRAST) return null

  // The successes have to span weeks. Four good days inside one good week are
  // one good week, and saying otherwise is exactly the overclaim this module
  // has to avoid to be worth anything.
  const weeks = new Set(doneItems.map((o) => startOfWeek(o.scheduledOn)))
  if (weeks.size < MIN_DISTINCT_WEEKS) return null

  const domains = new Set(inBucket.map((o) => o.domain))

  return {
    dimension,
    bucket,
    domain: domains.size === 1 ? ([...domains][0] as PlanDomain) : null,
    resolved: inBucket.length,
    done: doneItems.length,
    rate: round2(rate),
    comparisonRate: round2(comparisonRate),
    distinctWeeks: weeks.size,
    evidence: doneItems.map((o) => o.itemId),
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
