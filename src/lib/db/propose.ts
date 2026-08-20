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
 */
export async function withProposal(
  profileId: string,
  input: PlanInput,
): Promise<PlanInput> {
  if (input.aiProposal) return input

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
  const { proposal } = await proposePlan(input)

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
