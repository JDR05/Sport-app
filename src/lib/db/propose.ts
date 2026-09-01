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
