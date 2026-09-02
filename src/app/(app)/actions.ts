'use server'

// What the app screens are allowed to ask the server to do.
//
// Both actions establish the user from the verified session and never from the
// payload. `setItemStatus` additionally scopes its update to that user's id:
// row level security already refuses somebody else's row, but a query that
// relies on being refused is one refactor away from not being.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ensureWeekPlan, type WeekResult } from '@/lib/db/week-plan'
import { loadCheckIns, saveCheckIn, saveMeasurement, type CheckIn } from '@/lib/db/tracking'
import { acceptExperiment, concludeIfDue, declineExperiment } from '@/lib/db/experiments'
import { weeklyReview } from '@/lib/db/analysis'
import { applyPlanCare, type PlanCareResult } from '@/lib/db/plan-care'
import { grantConsent, readConsent, withdrawConsent, type ConsentState } from '@/lib/ai/consent'
import { restartAi, type AiRestart } from '@/lib/db/ai-restart'
import { saveIntakeAnswers } from '@/lib/db/intake-questions'
import { loadPlanInput } from '@/lib/db/plan-input'
import { refreshProposal } from '@/lib/db/propose'
import { serverToday } from '@/lib/db/today'
import { answerItem, applyOffer, type AnswerResult } from '@/lib/db/reaction'
import { askQuestion, askState, type AskResult, type AskState } from '@/lib/db/ask'
import { ensureWeeklyNote, type WeeklyNote } from '@/lib/db/weekly-note'
import { loadCommitments, saveCommitments } from '@/lib/db/commitments'
import { commitmentSchema } from '@/lib/db/schemas'
import type { Commitment } from '@/lib/domain/types'
import { QUESTION_MAX_CHARS } from '@/lib/ai/ask'
import { STATUS_REASONS, type Reaction } from '@/lib/adaptive/reaction'

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

/**
 * Carries out this week's small corrections.
 *
 * The patch is recomputed on the server from the database and never taken from
 * the payload: a move is a write against someone's plan, and a request naming
 * which rows to touch is a request that can name rows the engine never chose.
 */
export async function applyCorrections(today: unknown): Promise<PlanCareResult> {
  const user = await requireUser()

  const parsed = isoDate.safeParse(today)
  if (!parsed.success) return { ok: false, moved: 0, removed: 0 }

  return applyPlanCare(user.id, parsed.data)
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
      // A new verdict retires the reason given for the old one.
      //
      // Not tidiness: the check constraint forbids a reason on an `unknown`
      // row, so undoing an answered action by tapping the ring would fail the
      // whole update and silently roll the screen back. And a reason left
      // attached to a status it no longer explains is a fact about a week that
      // did not happen.
      status_reason: null,
      status_note: null,
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

// ------------------------------------------------------------------ reason ---

const reasonSchema = z.enum(STATUS_REASONS)

/**
 * The verdict, why it was given, and what the app offers to do about it.
 *
 * One round trip rather than two, because the offer has to appear in the same
 * moment as the tap. A second call to fetch it would put a spinner between the
 * question and the answer, on the one screen where the whole point is that the
 * app reacts immediately.
 */
export async function answerItemStatus(payload: unknown): Promise<AnswerResult> {
  const user = await requireUser()

  const parsed = z
    .object({
      itemId: z.uuid(),
      status: statusSchema,
      reason: reasonSchema.nullable(),
      // The database caps this at 300 as well. Two places on purpose: one is
      // a validation, the other is the truth.
      note: z.string().trim().max(300).nullable(),
      today: isoDate,
    })
    .safeParse(payload)

  if (!parsed.success) return { ok: false, reaction: null }

  const { itemId, status, reason, note, today } = parsed.data
  return answerItem(user.id, itemId, status, reason, note && note.length > 0 ? note : null, today)
}

/**
 * "Passt" — carry out what was offered.
 *
 * Takes the item and the day, and nothing else. The offer itself is worked out
 * again on the server from the stored reason, so the request cannot choose
 * which day an action lands on.
 */
export async function acceptReaction(
  itemId: unknown,
  today: unknown,
): Promise<{ ok: boolean; applied: Reaction | null }> {
  const user = await requireUser()

  const id = z.uuid().safeParse(itemId)
  const day = isoDate.safeParse(today)
  if (!id.success || !day.success) return { ok: false, applied: null }

  return applyOffer(user.id, id.data, day.data)
}

// -------------------------------------------------------------- commitments ---

export async function getCommitments(): Promise<Commitment[]> {
  const user = await requireUser()
  return loadCommitments(user.id)
}

/**
 * Replaces the week the person already has.
 *
 * Deliberately does **not** rebuild the current week's plan. A plan already
 * written is a promise already made (ADR-037), and rewriting Tuesday under
 * somebody who is halfway through it is the failure that rule exists to
 * prevent — it would also throw away the statuses that week already carries.
 * The next week is built from the new list, and the screen says so rather
 * than leaving the person to notice.
 *
 * The commitments themselves show up on Today and in the week view
 * immediately, because those are read live: what somebody has on Wednesday is
 * a fact about Wednesday, even when the plan around it is last Monday's.
 */
export async function updateCommitments(payload: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser()

  const parsed = z.array(commitmentSchema).max(30).safeParse(payload)
  if (!parsed.success) return { ok: false }

  const result = await saveCommitments(user.id, parsed.data as Commitment[])
  // The week is read on the server for several screens; a stale one would
  // still be showing the old Tuesday.
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

// ------------------------------------------------------------------ impulse ---

/**
 * Checks whether something has happened worth saying, and returns it if it
 * happened today.
 *
 * Called from Today, from the client, *after* the screen has rendered. Two
 * things follow from that and both are deliberate:
 *
 *   * Nothing waits for it. An impulse can cost a model call of ten seconds or
 *     more, and Today is the screen people open first — the one place in this
 *     app where a wait was already a bug once (ADR-088).
 *   * It is what makes the impulse an event at all. The trigger is checked
 *     whenever somebody opens the app, not when they happen to visit Insights,
 *     which is the screen they do not open.
 *
 * Returns only an impulse written *today*. One from Tuesday is not news on
 * Thursday, and it is still on Insights where the history belongs.
 */
export async function loadTodaysImpulse(today: unknown): Promise<WeeklyNote | null> {
  const user = await requireUser()

  const parsed = isoDate.safeParse(today)
  if (!parsed.success) return null

  const impulse = await ensureWeeklyNote(user.id, parsed.data)
  return impulse && impulse.writtenOn === parsed.data ? impulse : null
}

// ------------------------------------------------------------------- asking ---

/**
 * What the Today screen needs to draw the question box.
 *
 * Read on every load of Today, so it does exactly two queries and never calls
 * a model: the openers are deterministic, from this person's own week. A
 * doorway that needs a model call before it can be drawn is a doorway people
 * watch a spinner in front of.
 */
export async function loadAskState(today: unknown): Promise<AskState> {
  const user = await requireUser()

  const parsed = isoDate.safeParse(today)
  if (!parsed.success) {
    return { available: false, history: [], suggestions: [], exhausted: null }
  }

  return askState(user.id, parsed.data)
}

/**
 * One question to the model, answered from this person's own rows.
 *
 * The context is assembled on the server and never taken from the payload —
 * this request carries a question and a date, nothing else. A request that
 * carried the data the model reasons over would be a request that can choose
 * what the model believes about somebody.
 */
export async function submitQuestion(question: unknown, today: unknown): Promise<AskResult> {
  const user = await requireUser()

  const text = z.string().max(QUESTION_MAX_CHARS).safeParse(question)
  const day = isoDate.safeParse(today)
  if (!text.success || !day.success) {
    return { ok: false, reason: 'invalid', message: 'Das war zu kurz für eine Frage.' }
  }

  return askQuestion(user.id, text.data, day.data)
}

/**
 * Turning AI processing on or off for this account.
 *
 * A deliberate act with its own action rather than a field inside the
 * onboarding payload: consent has to be separable from everything else, given
 * on its own and withdrawn on its own. Art. 7 (3) requires withdrawal to be as
 * easy as giving it, and the same one-tap call in both directions is what
 * makes that true rather than stated.
 *
 * Revalidates the layout because the plan is read on the server: after a
 * withdrawal the screens must stop showing an AI badge the account no longer
 * has.
 */
export async function setAiConsent(granted: unknown): Promise<ConsentState> {
  const user = await requireUser()
  if (typeof granted !== 'boolean') return readConsent(user.id)

  if (granted) await grantConsent(user.id)
  else await withdrawConsent(user.id)

  revalidatePath('/', 'layout')
  // Read back rather than assumed. If the write failed, the person is told the
  // truth — the alternative is a ticked box over an account that never agreed,
  // which is the one error this whole module exists to prevent.
  return readConsent(user.id)
}

// ------------------------------------------------------ catching a goal up ---

/**
 * Re-opens a goal that was set up before there was a model to ask.
 *
 * `ai_proposal_at` is stamped whether or not a proposal came back — that is
 * what stops the app re-asking on every page load — so a goal created before a
 * key existed is marked "asked, nothing came back" permanently, and ticking
 * the consent box later changes nothing. Redoing the onboarding would fix it
 * and throw away the goal's tracking history to do so.
 */
export async function startAiForGoal(): Promise<AiRestart> {
  const user = await requireUser()
  return restartAi(user.id, await serverToday())
}

const intakeAnswerSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().max(300).nullable(),
})

/**
 * Stores the answers and fetches the proposal.
 *
 * Does **not** rebuild the current week. The plan for a week is written once
 * and the unique index means replacing it needs the successor's id before the
 * successor exists — the standoff ADR-033 describes. More to the point, this
 * week already carries answered actions, and a rebuild would leave two plans
 * describing the same days, which is double the evidence for a week that was
 * lived once. The proposal is stored and the next week is built from it.
 */
export async function finishAiForGoal(payload: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser()

  const parsed = z.array(intakeAnswerSchema).max(3).safeParse(payload)
  if (!parsed.success) return { ok: false }

  if (parsed.data.length > 0) await saveIntakeAnswers(user.id, parsed.data)

  const input = await loadPlanInput(user.id)
  if (!input) return { ok: false }

  const today = await serverToday()
  // refreshProposal, not withProposal: this path is explicitly "ask again", and
  // it writes only if an answer came back — so a provider that is down leaves
  // the previous proposal intact instead of erasing it.
  //
  // `written`, not `aiProposal != null`: the old proposal is still in `input`
  // precisely because it was not erased, so the presence of one says nothing
  // about whether this call achieved anything.
  const { written } = await refreshProposal(user.id, { ...input, today })

  revalidatePath('/', 'layout')
  return { ok: written }
}
