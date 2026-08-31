// Actually carrying out the small corrections.
//
// Plan care computed a patch, Insights printed the count, and nothing ever
// happened. "2 Aktionen könnten an einem anderen Tag besser passen" was a
// sentence about a data structure — the actions stayed where they were, and
// the same offer came back every time the screen was opened.
//
// It is applied on request rather than automatically, and that is ADR-039
// rather than timidity: a week is a promise already made, so it may be changed
// by the person, never under them. What was silent before was the *absence* of
// the change; the offer itself was always visible.
//
// The patch is recomputed here from the database and never taken from the
// client. A move is a write against someone's plan, and a payload naming which
// rows to touch is a payload that can name rows the engine never chose.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadWeekItems } from './analysis'
import { refinePlan } from '@/lib/adaptive'
import { startOfWeek, weekdayOf } from '@/lib/engine/dates'
import type { Json } from './database.types'

export type PlanCareResult = {
  ok: boolean
  /** Make-up actions created for days that did not work out. */
  moved: number
  /** Repeats of a dismissed action that will no longer be asked about. */
  removed: number
}

const NOTHING: PlanCareResult = { ok: true, moved: 0, removed: 0 }

const WEEKDAY_LABEL: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export async function applyPlanCare(profileId: string, today: string): Promise<PlanCareResult> {
  const weekStart = startOfWeek(today)
  // The whole week, not the analysis window: a day this cannot see looks free,
  // and a make-up would land on a day that already carries the same domain.
  const patch = refinePlan(await loadWeekItems(profileId, weekStart), today)
  if (patch.moves.length === 0 && patch.removals.length === 0) return NOTHING

  const supabase = await createClient()
  const result: PlanCareResult = { ok: true, moved: 0, removed: 0 }

  // ------------------------------------------------------------- moves ---
  //
  // A move creates a second action rather than rewriting the first, and that
  // is the whole design. Rewriting `scheduled_on` would carry the miss off
  // Monday and destroy the one thing the slow tier is looking for — that
  // Mondays keep not working. The record of what happened has to survive the
  // courtesy of being offered another day.
  for (const move of patch.moves) {
    // Bounded to this week twice over: refinePlan only proposes dates inside
    // it, and the guard means a stale patch cannot reach into a week that was
    // already written and worked through.
    if (move.toDate <= today || move.toDate < weekStart) continue

    const source = await supabase
      .from('plan_items')
      .select('*')
      .eq('id', move.itemId)
      .eq('profile_id', profileId)
      .eq('status', 'missed')
      .maybeSingle()

    if (source.error) {
      result.ok = false
      continue
    }
    // Gone, or the person has answered it differently since. Theirs counts.
    if (!source.data) continue

    // Idempotent by construction. Pressing the button twice must not produce
    // two make-ups for one missed action, and the original stays `missed` —
    // so without this the second press would simply find it again.
    const existing = await supabase
      .from('plan_items')
      .select('id, details')
      .eq('profile_id', profileId)
      .eq('plan_id', source.data.plan_id)

    if (existing.error) {
      result.ok = false
      continue
    }
    const already = (existing.data ?? []).some(
      (row) => (row.details as Record<string, unknown> | null)?.makeUpFor === move.itemId,
    )
    if (already) continue

    const inserted = await supabase.from('plan_items').insert({
      plan_id: source.data.plan_id,
      profile_id: profileId,
      scheduled_on: move.toDate,
      domain: source.data.domain,
      track: source.data.track,
      title: source.data.title,
      planned_duration_min: source.data.planned_duration_min,
      time_slot: source.data.time_slot,
      rationale:
        `Nachholtermin für ${WEEKDAY_LABEL[weekdayOf(move.fromDate)] ?? move.fromDate}. ` +
        `Ein einzelner Ausfall sagt noch nichts — der Tag wird dir angeboten, nicht vorgeworfen.`,
      rationale_based_on: ['planCare.move', move.itemId],
      details: {
        ...((source.data.details ?? {}) as Record<string, unknown>),
        makeUpFor: move.itemId,
      } as Json,
      status: 'unknown',
    })

    if (inserted.error) {
      result.ok = false
      continue
    }
    result.moved += 1
  }

  // ---------------------------------------------------------- removals ---
  for (const removal of patch.removals) {
    // Carrying the person's own answer forward onto the repeats they have not
    // been asked about yet. Not a deletion: the row stays, `not_relevant`
    // never counts as a miss, and detection still reads it as what it is — the
    // plan having asked for the wrong thing.
    const written = await supabase
      .from('plan_items')
      .update({ status: 'not_relevant' })
      .eq('id', removal.itemId)
      .eq('profile_id', profileId)
      // Only ones nobody has answered. An action the person has since ticked
      // off is theirs, and this must not overwrite it.
      .in('status', ['unknown', 'planned'])
      .select('id')

    if (written.error) {
      result.ok = false
      continue
    }
    result.removed += (written.data ?? []).length
  }

  return result
}
