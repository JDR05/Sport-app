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
import { loadCheckIns, saveCheckIn, saveMeasurement, type CheckIn } from '@/lib/db/tracking'
import { acceptExperiment, concludeIfDue, declineExperiment } from '@/lib/db/experiments'
import { weeklyReview } from '@/lib/db/analysis'

// Shared with the onboarding: a shape check is not a value check.
import { isoDate } from '@/lib/domain/isoDate'

/** The date comes from the client because the server runs in UTC. */
export async function loadWeek(today: unknown): Promise<WeekResult> {
  const user = await requireUser()

  const parsed = isoDate.safeParse(today)
  if (!parsed.success) return { ok: false, reason: 'no_goal' }

  // Opening the app is what concludes a finished experiment.
  //
  // Until now only the Insights screen did, and someone who never opens it had
  // an experiment left running for ever — which, because only one may be open
  // at a time, silently blocked every future one and kept its trial rule
  // shaping plans indefinitely. This is the screen people actually open, and
  // the conclusion is idempotent, so running it here costs nothing when there
  // is nothing to conclude.
  //
  // Deliberately not awaited for its result: a conclusion that fails must not
  // stop someone seeing their week.
  await concludeIfDue(user.id, parsed.data).catch(() => null)

  return ensureWeekPlan(user.id, parsed.data)
}

// ---------------------------------------------------------------- check-in ---

const checkInSchema = z.object({
  checkedInOn: isoDate,
  // One to five, or nothing at all. A day nobody rated is not a bad day.
  energy: z.number().int().min(1).max(5).nullable(),
  mood: z.number().int().min(1).max(5).nullable(),
  stress: z.number().int().min(1).max(5).nullable(),
  // Half-hour resolution is as precise as anyone's estimate of their own
  // night. The upper bound is a sanity check, not a judgement.
  sleepHours: z.number().min(0).max(24).nullable(),
  dietQuality: z.number().int().min(1).max(5).nullable(),
  soreness: z.number().int().min(1).max(5).nullable(),
  // A count of standard drinks. The upper bound is a sanity check on the
  // input, not a comment on the evening.
  alcoholUnits: z.number().min(0).max(50).nullable(),
  caffeineLate: z.boolean().nullable(),
  note: z.string().trim().max(2000).nullable(),
})

export async function submitCheckIn(payload: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser()
  const parsed = checkInSchema.safeParse(payload)
  if (!parsed.success) return { ok: false }
  return saveCheckIn(user.id, parsed.data)
}

export async function getCheckIns(since: unknown): Promise<CheckIn[]> {
  const user = await requireUser()
  const parsed = isoDate.safeParse(since)
  if (!parsed.success) return []
  return loadCheckIns(user.id, parsed.data)
}

// ------------------------------------------------------------- measurement ---

const measurementSchema = z.object({
  metricKey: z.string().min(1).max(64),
  // Wide on purpose: this holds kilograms, kilometres and repetitions. The
  // engine's own limits decide what is plausible for a given goal; a recording
  // endpoint refusing a number it does not understand would be guessing.
  value: z.number().finite().min(0).max(100000),
  unit: z.string().min(1).max(16),
})

export async function submitMeasurement(payload: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser()
  const parsed = measurementSchema.safeParse(payload)
  if (!parsed.success) return { ok: false }
  return saveMeasurement(user.id, parsed.data.metricKey, parsed.data.value, parsed.data.unit)
}

// -------------------------------------------------------------- experiment ---

/**
 * Accepting or declining does not take the proposal from the client. The
 * analysis is re-run on the server and the current proposal is what gets
 * stored — otherwise a crafted payload could write any rule it liked into
 * somebody's personal model, and the model is the one thing here that outlives
 * a single week.
 */
export async function respondToExperiment(
  today: unknown,
  accept: unknown,
): Promise<{ ok: boolean }> {
  const user = await requireUser()

  const day = isoDate.safeParse(today)
  const yes = z.boolean().safeParse(accept)
  if (!day.success || !yes.success) return { ok: false }

  const review = await weeklyReview(user.id, day.data)
  const proposal = review?.analysis.experiment
  if (!proposal) return { ok: false }

  return yes.data
    ? acceptExperiment(user.id, proposal)
    : declineExperiment(user.id, proposal)
}

// ------------------------------------------------------------------ status ---

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
