// Planned action ↔ database row.
//
// Pure and separate from the queries so it can be tested without a database,
// because this is where things vanish quietly. A dropped `track` makes the
// health baseline indistinguishable from the goal track; a dropped
// `basedOn` leaves a recommendation that cannot point at the input it came
// from, which principle 4 says must not exist. Neither failure looks like a
// failure — the screen still renders, just slightly less true.

import type { PlanItemStatus, PlanTrack, PlannedItem, TimeSlot } from '@/lib/domain/types'
import type { Json } from './database.types'

export type ItemRow = {
  id: string
  scheduled_on: string
  domain: PlannedItem['domain']
  track: PlanTrack
  title: string
  planned_duration_min: number | null
  time_slot: string | null
  rationale: string | null
  rationale_based_on: Json
  details: Json
  status: PlanItemStatus
}

export type ItemInsert = Omit<ItemRow, 'id'> & {
  plan_id: string
  profile_id: string
}

const SLOTS: readonly string[] = ['early', 'midday', 'evening']

export function toInsert(
  item: PlannedItem,
  planId: string,
  profileId: string,
): ItemInsert {
  return {
    plan_id: planId,
    profile_id: profileId,
    scheduled_on: item.scheduledOn,
    domain: item.domain,
    track: item.track,
    title: item.title,
    planned_duration_min: item.plannedDurationMin,
    time_slot: item.timeSlot,
    rationale: item.rationale.text,
    rationale_based_on: item.rationale.basedOn,
    details: item.details as Json,
    // Untouched means unknown, never missed. ADR-011.
    status: 'unknown',
  }
}

export function fromRow(row: ItemRow): PlannedItem & { id: string; status: PlanItemStatus } {
  return {
    id: row.id,
    scheduledOn: row.scheduled_on,
    domain: row.domain,
    track: row.track,
    title: row.title,
    plannedDurationMin: row.planned_duration_min,
    timeSlot:
      typeof row.time_slot === 'string' && SLOTS.includes(row.time_slot)
        ? (row.time_slot as TimeSlot)
        : null,
    rationale: {
      text: row.rationale ?? '',
      basedOn: Array.isArray(row.rationale_based_on)
        ? row.rationale_based_on.filter((v): v is string => typeof v === 'string')
        : [],
    },
    details: (row.details ?? {}) as Record<string, unknown>,
    status: row.status,
  }
}
