'use server'

// What the app screens are allowed to ask the server to do.
//
// Both actions establish the user from the verified session and never from the
// payload. `setItemStatus` additionally scopes its update to that user's id:
// row level security already refuses somebody else's row, but a query that
// relies on being refused is one refactor away from not being.

import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ensureWeekPlan, type WeekResult } from '@/lib/db/week-plan'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The date comes from the client because the server runs in UTC. */
export async function loadWeek(today: unknown): Promise<WeekResult> {
  const user = await requireUser()

  const parsed = isoDate.safeParse(today)
  if (!parsed.success) return { ok: false, reason: 'no_goal' }

  return ensureWeekPlan(user.id, parsed.data)
}

const statusSchema = z.enum(['planned', 'done', 'moved', 'missed', 'not_relevant', 'unknown'])

export type StatusResult = { ok: boolean }

export async function setItemStatus(itemId: unknown, status: unknown): Promise<StatusResult> {
  const user = await requireUser()

  const id = z.uuid().safeParse(itemId)
  const next = statusSchema.safeParse(status)
  if (!id.success || !next.success) return { ok: false }

  const supabase = await createClient()
  const { error } = await supabase
    .from('plan_items')
    .update({
      status: next.data,
      // When it was decided, not when it was planned. The adaptive engine reads
      // this to tell "marked missed that evening" from "marked missed three
      // weeks later", which are not the same signal.
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', id.data)
    .eq('profile_id', user.id)

  // No revalidatePath: the provider owns this state and updated it optimistically
  // before the round trip. Re-rendering the route here would do work nobody sees
  // and could make a settled action flicker back and forth.
  return { ok: error === null }
}
