// The week the person already has, on its own.
//
// Separate from `loadPlanInput`, which reads the profile, the goal, the
// schedule, the constraints and the personal rules to build a plan. Two screens
// and one editor need nothing but this one field, and paying for the whole
// intake to draw a line that says "Fußballtraining, 19:00" is the kind of
// round trip that makes a phone app feel slow.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { readCommitments } from './schemas'
import type { Commitment } from '@/lib/domain/types'

export async function loadCommitments(profileId: string): Promise<Commitment[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('schedules')
    .select('commitments')
    .eq('profile_id', profileId)
    .maybeSingle()

  // Validated on the way out as well as on the way in: the column is jsonb, so
  // nothing in Postgres guarantees its shape, and this is read into a plan — a
  // malformed entry is the difference between a session planned around
  // football and one planned on top of it. `readCommitments` drops what does
  // not parse rather than throwing, because one broken entry must not cost
  // somebody their whole week.
  return readCommitments(data?.commitments)
}

/**
 * Replaces the whole list.
 *
 * Whole rather than incremental because that is what the editor produces: the
 * screen holds the complete week and hands it back. A per-entry API would need
 * ids on something that has never had them, and two ways to be wrong about the
 * same list.
 *
 * Does **not** touch the current week's plan. A plan already written is a
 * promise already made (ADR-037), and rewriting Tuesday under somebody halfway
 * through it is the failure that rule exists to prevent. The screen says so.
 */
export async function saveCommitments(
  profileId: string,
  commitments: Commitment[],
): Promise<{ ok: boolean }> {
  const supabase = await createClient()

  // Update rather than upsert: a schedule row exists for anybody who finished
  // the onboarding, and this screen is only reachable from inside the app. An
  // upsert here could write a schedule with no wake times and no free slots
  // over a real one if the id were ever wrong.
  const { error } = await supabase
    .from('schedules')
    .update({ commitments: commitments as unknown as never })
    .eq('profile_id', profileId)

  return { ok: error === null }
}
