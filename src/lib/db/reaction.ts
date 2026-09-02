// Storing why, and carrying out what was offered.
//
// Two calls, and the split between them is the point. `answerItem` records the
// status and the reason and *offers* something; nothing in the plan has moved
// yet. `applyOffer` is the second tap, and it recomputes the offer from the
// database rather than taking it from the request — a move is a write against
// somebody's plan, and a payload naming the target date is a payload that can
// name any date it likes, including one the engine would never have chosen.
//
// That is the same rule `applyCorrections` and `respondToExperiment` already
// follow, for the same reason.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { reactTo, type Reaction, type StatusReason } from '@/lib/adaptive/reaction'
import { toObservations } from './observations'
import { fromRow, type ItemRow } from './item-mapping'
import { addDays, startOfWeek } from '@/lib/engine/dates'
import type { PlanItemStatus } from '@/lib/domain/types'
import type { StoredItem } from './week-plan'

export type AnswerResult = {
  ok: boolean
  /** What the app offers to do about it. Null when the write failed. */
  reaction: Reaction | null
}

/**
 * Records the verdict, the reason behind it, and what follows.
 *
 * The reason only reaches the database together with a real verdict: the check
 * constraint refuses a reason on an `unknown` row, and this refuses to send
 * one, so the rule holds in both places rather than only in the one somebody
 * remembers to look at.
 */
export async function answerItem(
  profileId: string,
  itemId: string,
  status: PlanItemStatus,
  reason: StatusReason | null,
  note: string | null,
  today: string,
): Promise<AnswerResult> {
  const supabase = await createClient()

  const settled = status !== 'unknown' && status !== 'planned'

  const { error } = await supabase
    .from('plan_items')
    .update({
      status,
      // Clearing a verdict clears its reason with it. A reason that outlives
      // the status it explained is a fact about a week that no longer happened.
      status_reason: settled ? reason : null,
      status_note: settled ? note : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('profile_id', profileId)

  if (error) return { ok: false, reaction: null }
  if (!settled || !reason) return { ok: true, reaction: null }

  return { ok: true, reaction: await offerFor(profileId, itemId, reason, today) }
}

/**
 * Carries out the offer — after working out again what it was.
 *
 * Returns the reaction that was applied, so the screen can say what happened
 * rather than assuming its own optimistic guess was right.
 */
export async function applyOffer(
  profileId: string,
  itemId: string,
  today: string,
): Promise<{ ok: boolean; applied: Reaction | null }> {
  const supabase = await createClient()

  const row = await supabase
    .from('plan_items')
    .select('status_reason')
    .eq('id', itemId)
    .eq('profile_id', profileId)
    .maybeSingle()

  const reason = row.data?.status_reason as StatusReason | null | undefined
  if (!reason) return { ok: false, applied: null }

  const reaction = await offerFor(profileId, itemId, reason, today)
  if (!reaction || reaction.kind === 'none') return { ok: false, applied: null }

  // Deliberately narrow updates: a move touches the date and a shorten touches
  // the duration, and neither may touch anything else. The status stays as the
  // person set it — a moved action is still an action that did not happen on
  // the day it was planned for, and rewriting that to `planned` would erase
  // the very signal this feature exists to collect.
  const patch =
    reaction.kind === 'move'
      ? { scheduled_on: reaction.toDate }
      : { planned_duration_min: reaction.toMinutes }

  const { error } = await supabase
    .from('plan_items')
    .update(patch)
    .eq('id', itemId)
    .eq('profile_id', profileId)

  return error ? { ok: false, applied: null } : { ok: true, applied: reaction }
}

/** The reaction for one item, computed from that item's own week. */
async function offerFor(
  profileId: string,
  itemId: string,
  reason: StatusReason,
  today: string,
): Promise<Reaction | null> {
  const supabase = await createClient()

  const itemRow = await supabase
    .from('plan_items')
    .select('*')
    .eq('id', itemId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!itemRow.data) return null
  const item: StoredItem = fromRow(itemRow.data as ItemRow)

  const weekStart = startOfWeek(today)

  // Everything this person has in the current week, whichever plan it belongs
  // to. Scoped by profile as well as by plan: RLS already refuses another
  // account's rows, but a query that relies on being refused is one refactor
  // away from not being.
  const weekRows = await supabase
    .from('plan_items')
    .select('*')
    .eq('profile_id', profileId)
    .eq('plan_id', itemRow.data.plan_id)

  const week = toObservations((weekRows.data ?? []).map((row) => fromRow(row as ItemRow)))

  return reactTo({
    reason,
    item: {
      id: item.id,
      scheduledOn: item.scheduledOn,
      domain: item.domain,
      plannedDurationMin: item.plannedDurationMin,
    },
    // The item itself must not block its own move: it is on the day that just
    // failed, and `bestFreeDay` skips that day anyway, but leaving it in would
    // also make its domain look occupied on that day for no reason.
    week: week.filter((o) => o.itemId !== item.id),
    today,
    weekStart,
  })
}

/**
 * What this person said about the week, in their own words and taps.
 *
 * The reason detection could never have: "zu müde, dreimal, alles Training" is
 * a fact somebody stated, where "drei Mittwoche verpasst" is an inference from
 * a calendar. The weekly impulse reads both, and this is the half that is not
 * a guess.
 */
export type ReasonSummary = {
  counts: Array<{ reason: StatusReason; domain: string; count: number }>
  notes: Array<{ date: string; text: string }>
}

export async function weekReasons(
  profileId: string,
  weekStart: string,
): Promise<ReasonSummary> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('plan_items')
    .select('scheduled_on, domain, status_reason, status_note')
    .eq('profile_id', profileId)
    .gte('scheduled_on', weekStart)
    .lte('scheduled_on', addDays(weekStart, 6))
    .not('status_reason', 'is', null)
    .order('scheduled_on', { ascending: true })

  const tally = new Map<string, { reason: StatusReason; domain: string; count: number }>()
  const notes: Array<{ date: string; text: string }> = []

  for (const row of data ?? []) {
    const reason = row.status_reason as StatusReason | null
    if (!reason) continue

    const key = `${reason}|${row.domain}`
    const seen = tally.get(key)
    if (seen) seen.count += 1
    else tally.set(key, { reason, domain: row.domain, count: 1 })

    const text = row.status_note?.trim()
    if (text) notes.push({ date: row.scheduled_on, text: text.slice(0, 300) })
  }

  // Loudest first: three of the same reason is the thing worth reading, and a
  // list sorted by accident buries it.
  const counts = [...tally.values()].sort((a, b) => b.count - a.count)
  return { counts, notes }
}
