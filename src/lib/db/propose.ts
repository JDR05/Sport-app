// Asking the model for plan actions — once per goal.
//
// Once, not once per week: the proposal is an input to planning (ADR-041), and
// it does not change because a Monday arrived. Asking again would cost money to
// receive the same answer, and would quietly make the plan non-reproducible.
//
// `ai_proposal_at` separates "not asked yet" from "asked, no answer". The
// second is an ordinary outcome — no key, a refusal, a failed plausibility
// check — and must not be retried on every page load.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { proposePlan } from '@/lib/ai'
import { adapterFor, mayUseAi } from '@/lib/ai/consent'
import type { AiProposal, PlanInput } from '@/lib/domain/types'

/**
 * Which mode a proposal is asked for.
 *
 * `takeover` only where the archetypes have nothing to offer. Everywhere else
 * the tested deterministic plan stands and the model adds to it — the product
 * owner's decision, and the reason a common goal cannot get worse by having a
 * key configured.
 */
function modeFor(input: PlanInput): AiProposal['mode'] {
  return input.goal.archetype === 'general_health' ? 'takeover' : 'augment'
}

/**
 * Ensures the active goal has been asked about, and returns the input with
 * whatever came back. Never throws: a failure here means planning without a
 * proposal, which is the same state the app is in without a key.
 *
 * @param budgetMs how long the model may take. This call used to sit inside
 *   ensureWeekPlan with the full configured timeout, which meant the first
 *   time a week was opened the app could stop dead for twenty seconds with an
 *   empty screen — the "es hängt sich manchmal auf". It is asked during the
 *   onboarding now, where the button already says "Plan wird gebaut" and a
 *   wait is what the person is expecting. The week-load path keeps it only as
 *   a fallback for a goal that was never asked, on a budget short enough that
 *   a slow answer costs a moment rather than the screen.
 */
export async function withProposal(
  profileId: string,
  input: PlanInput,
  budgetMs?: number,
): Promise<PlanInput> {
  if (input.aiProposal) return input

  // Before anything is written, not after.
  //
  // `adapterFor` would decline the call correctly, but the timestamp below is
  // written either way to stop a retry loop — so going through the motions
  // without consent would stamp the goal as "asked, nothing came back" and the
  // model would never be asked again, not even after someone ticks the box.
  // Leaving early keeps `ai_proposal_at` null, which is exactly what "not asked
  // yet" means.
  if (!(await mayUseAi(profileId))) return input

  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id, ai_proposal_at')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()

  // Already asked and nothing came back. Leave it alone.
  if (!goal.data || goal.data.ai_proposal_at !== null) return input

  const mode = modeFor(input)
  const { proposal } = await proposePlan(input, await adapterFor(profileId, budgetMs))

  const stored: AiProposal | null = proposal
    ? {
        headline: proposal.headline,
        reasoning: proposal.reasoning,
        actions: proposal.actions,
        mode,
      }
    : null

  // The timestamp is written either way — that is what stops a retry loop.
  await supabase
    .from('goals')
    .update({
      ai_proposal: stored as unknown as Record<string, unknown> | null,
      ai_proposal_at: new Date().toISOString(),
    })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)

  return stored ? { ...input, aiProposal: stored } : input
}

/** Re-asks the model, e.g. after a key was configured. */
export async function clearProposal(profileId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('goals')
    .update({ ai_proposal: null, ai_proposal_at: null })
    .eq('profile_id', profileId)
    .eq('status', 'active')
}

/**
 * Asks again for a goal that already has an answer, and replaces it only once
 * a new one is in hand.
 *
 * Separate from `withProposal` because the two want opposite things.
 * `withProposal` must never re-ask; this must. And the ordering is the point:
 * `restartAi` used to call `clearProposal` first and then ask, which is
 * destroy-then-build — the exact inverse of the rule save-onboarding.ts states
 * for the same reason. PostgREST gives each statement its own transaction, so
 * ordering *is* the safety property: a provider that is down between the two
 * writes took somebody's working proposal with it, unrecoverably, and the
 * screen could only say "the model gave nothing".
 *
 * Now nothing is written unless there is something to write. A failure leaves
 * the previous answer exactly where it was.
 */
export async function refreshProposal(
  profileId: string,
  input: PlanInput,
): Promise<{ input: PlanInput; written: boolean }> {
  const { proposal } = await proposePlan(input, await adapterFor(profileId))
  // Reports what it did, rather than returning an input the caller has to
  // guess about. Because restartAi deliberately no longer clears the old
  // proposal first, `input.aiProposal` is still the *previous* answer on every
  // failure path — so a caller checking `aiProposal != null` was told the
  // model had answered when nothing was asked, written or changed.
  if (!proposal) return { input, written: false }

  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (!goal.data) return { input, written: false }

  const stored: AiProposal = {
    headline: proposal.headline,
    reasoning: proposal.reasoning,
    actions: proposal.actions,
    mode: modeFor(input),
  }

  const { error } = await supabase
    .from('goals')
    .update({
      ai_proposal: stored as unknown as Record<string, unknown>,
      ai_proposal_at: new Date().toISOString(),
    })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)

  return error === null
    ? { input: { ...input, aiProposal: stored }, written: true }
    : { input, written: false }
}
