// Stored plan items, as the adaptive engine sees them.
//
// This is the join between the two halves of the product: the plan says what
// was meant to happen, the status says what did, and the adaptive engine only
// ever reads the pair. Keeping the conversion here and pure means the learning
// loop stays testable without a database — which is why it could be built and
// proven before any of this existed.
//
// Nothing is filtered out on the way. `unknown` and `not_relevant` travel
// through and are excluded inside detection, where the reasoning for excluding
// them lives. Filtering here as well would put the same rule in two places, and
// the copy nobody looks at is the one that drifts.

import { ANALYSIS_WEEKS } from '@/lib/adaptive/constants'
import { addDays, startOfWeek } from '@/lib/engine/dates'
import type { Observation } from '@/lib/adaptive'
import type { StoredItem } from './week-plan'

/**
 * The earliest date detection looks at: the Monday `weeks - 1` weeks before the
 * current one, so the window spans exactly `weeks` calendar weeks including
 * today's.
 *
 * Pure and separate because an off-by-one here shrinks the window silently.
 * Five weeks instead of six is not an error anyone sees — it just makes the
 * app quieter than it should be, and "no pattern found" looks identical either
 * way.
 */
export function analysisWindowStart(today: string, weeks: number = ANALYSIS_WEEKS): string {
  return addDays(startOfWeek(today), -7 * (weeks - 1))
}

export function toObservations(items: StoredItem[]): Observation[] {
  return items.map((item) => ({
    itemId: item.id,
    scheduledOn: item.scheduledOn,
    domain: item.domain,
    track: item.track,
    title: item.title,
    timeSlot: item.timeSlot,
    plannedDurationMin: item.plannedDurationMin,
    status: item.status,
  }))
}
