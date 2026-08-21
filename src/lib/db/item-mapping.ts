// Planned action ↔ database row.
//
// Pure and separate from the queries so it can be tested without a database,
// because this is where things vanish quietly. A dropped `track` makes the
// health baseline indistinguishable from the goal track; a dropped
// `basedOn` leaves a recommendation that cannot point at the input it came
// from, which principle 4 says must not exist. Neither failure looks like a
// failure — the screen still renders, just slightly less true.

import type { Cadence, PlanItemStatus, PlanTrack, PlannedItem, TimeSlot } from '@/lib/domain/types'
import type { Json } from './database.types'
import { addDays } from '@/lib/engine/dates'

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
    // Carried in details rather than in a column of its own: by the time a
    // row exists the expansion has already happened, so the cadence is history
    // rather than instruction. It survives the round trip because Today groups
    // standing rules together, and a flag that vanished on write would leave
    // the screen unable to tell a daily rule from an appointment.
    details: { ...item.details, cadence: item.cadence ?? 'weekly' } as Json,
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
    // The cadence rides inside details on the way in and is lifted back out
    // here, so an item that goes through the database comes back exactly as it
    // went in — details included. A round trip that quietly gains a key is the
    // kind of drift this module exists to prevent.
    details: withoutCadence(row.details),
    cadence: readCadence(row.details),
    status: row.status,
  }
}

function readCadence(details: Json | null): Cadence {
  const value = (details as Record<string, unknown> | null)?.cadence
  return value === 'daily' ? 'daily' : 'weekly'
}

function withoutCadence(details: Json | null): Record<string, unknown> {
  const rest = { ...((details ?? {}) as Record<string, unknown>) }
  delete rest.cadence
  return rest
}

/**
 * A standing rule becomes the seven days it actually covers.
 *
 * The engine emits one item per rule on purpose — the archetype invariants
 * count rules, not days, and a cap of three nutrition additions must not be
 * tripped by the same three appearing on seven mornings. But a week in the
 * database is a list of days, and a rule that lives on one of them is wrong
 * twice over: the plan reads as nonsense ("Eiweiß zu jeder Hauptmahlzeit", on
 * a Wednesday), and the whole nutrition side of a goal ends up measured by a
 * single tick a week — which is what the adaptive engine then draws its
 * conclusions from.
 *
 * Expanding at the storage boundary keeps both truths: the engine's limits
 * count what was decided, and everything downstream — Today, the rings,
 * detection — sees the days the person actually has.
 */
export function materialise(items: PlannedItem[], weekStart: string): PlannedItem[] {
  return items.flatMap((item) => {
    if (item.cadence !== 'daily') return [item]
    return Array.from({ length: 7 }, (_, day) => ({
      ...item,
      scheduledOn: addDays(weekStart, day),
    }))
  })
}
