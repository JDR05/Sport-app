// Where the person actually stands, as opposed to where they set out from.
//
// Measurements were written on every entry, drawn on the Progress chart, and
// read by nothing that plans. So a plan was computed from the start value for
// ever: someone four kilos into a five-kilo goal still got the deficit sized
// for the whole five, and someone who had arrived kept getting a deficit they
// no longer needed. The second one is not just wrong, it is the sort of wrong
// CLAUDE.md's body rules exist to prevent.
//
// Pure, and separate from the archetypes, because all three metric archetypes
// need the same answer and none of them should each decide it differently.

import type { GoalMetric } from '@/lib/domain/types'

/**
 * The value to plan from: the latest measurement when there is one, otherwise
 * what the person said at the start.
 *
 * Null is a real answer — no metric at all — and the caller's own fallback
 * applies. A metric with a start but no measurement plans from the start,
 * which is exactly the old behaviour and correct on day one.
 */
export function currentOf(metric: GoalMetric | undefined): number | null {
  if (!metric) return null
  return metric.currentValue ?? metric.startValue
}
