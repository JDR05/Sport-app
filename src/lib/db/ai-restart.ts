// Bringing a goal that predates the model back within its reach.
//
// `ai_proposal_at` is stamped whether or not a proposal came back, and that is
// deliberate: it is what stops the app asking again on every page load for a
// goal the model declined. But it means a goal set up *before* a key was
// configured is stamped "asked, nothing came back" for ever. Ticking the
// consent box later changes nothing, because nothing ever asks again.
//
// That is the state the product owner hit, and the honest answer to "do I have
// to start over" has to be no. Redoing the onboarding would work — it retires
// the goal and builds a new one — but it would throw away the tracking history
// attached to the goal to fix a stamp.
//
// So: clear the stamps, ask again, and keep everything else.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { classifyGoal } from '@/lib/ai'
import { adapterFor, mayUseAi } from '@/lib/ai/consent'
import { askIntakeQuestions } from './intake-questions'
import { clearProposal } from './propose'
import { loadPlanInput } from './plan-input'
import type { IntakeQuestion } from '@/lib/ai/schemas'
import type { AiFailure } from '@/lib/ai'
import type { GoalArchetype } from '@/lib/domain/types'

export type AiRestart = {
  questions: IntakeQuestion[]
  /** Set when the model read the goal differently than the word list did. */
  reclassified: GoalArchetype | null
  /**
   * Why the classification did not come from the model, when it did not.
   *
   * Carried to the screen rather than only to the log. A person looking at
   * "the model gave nothing" cannot act on it; "the provider rejected the key"
   * and "the answer failed the safety check" lead to two completely different
   * next steps, and only one of them is theirs to take.
   */
  failure: AiFailure | null
}

const NOTHING: AiRestart = { questions: [], reclassified: null, failure: null }

/**
 * Re-opens the active goal to the model: classification, then questions.
 *
 * The proposal itself is not fetched here. It is the slow call, and it needs
 * the answers to the questions — which do not exist yet at this point.
 */
export async function restartAi(profileId: string, today: string): Promise<AiRestart> {
  try {
    return await run(profileId, today)
  } catch {
    return NOTHING
  }
}

async function run(profileId: string, today: string): Promise<AiRestart> {
  if (!(await mayUseAi(profileId))) return NOTHING

  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id, raw_text, archetype, classified_by')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (!goal.data) return NOTHING

  // Both stamps, so the goal counts as never asked again. clearProposal alone
  // would leave intake_asked_at set for a goal that was created after the
  // questions shipped, and the questions would be skipped silently.
  await clearProposal(profileId)
  await supabase
    .from('goals')
    .update({ intake_asked_at: null })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)

  // Classify first: the archetype decides which safety limits apply and what
  // the plan is even made of, so a proposal built on a word-list guess is
  // built on the wrong foundation. This is the one goal in the database that
  // was never seen by a model.
  const classified = await reclassify(profileId, goal.data.id, {
    rawText: goal.data.raw_text,
    archetype: goal.data.archetype,
  })

  // Re-read: the classification may have changed the archetype, and asking the
  // model what it is missing for the *old* one would be asking about a goal
  // the app no longer holds.
  const input = await loadPlanInput(profileId)
  if (!input) return { ...NOTHING, ...classified }

  const questions = await askIntakeQuestions(profileId, { ...input, today })
  return { questions, ...classified }
}

/**
 * Asks the model to read the goal, and writes the answer only if it differs.
 *
 * Returns the new archetype or null. Null covers both "the model agreed" and
 * "the model could not answer" on purpose: from the screen's point of view
 * they are the same event — nothing about the goal changed.
 */
async function reclassify(
  profileId: string,
  goalId: string,
  goal: { rawText: string; archetype: GoalArchetype },
): Promise<{ reclassified: GoalArchetype | null; failure: AiFailure | null }> {
  const classified = await classifyGoal(goal.rawText, await adapterFor(profileId))

  // `source` is 'fallback' when the deterministic classifier answered — which
  // is what the goal already holds, so there is nothing to write. The reason
  // travels on, because that is the one thing the screen can act on.
  if (classified.source !== 'ai') {
    return { reclassified: null, failure: classified.fallbackReason ?? 'api_error' }
  }

  const archetype = classified.value.archetype as GoalArchetype
  const supabase = await createClient()
  await supabase
    .from('goals')
    .update({ archetype, classified_by: 'ai' })
    .eq('id', goalId)
    .eq('profile_id', profileId)

  return { reclassified: archetype === goal.archetype ? null : archetype, failure: null }
}
