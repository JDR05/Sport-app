// The step where the model asks instead of answers.
//
// The onboarding asks everybody the same things, and it has to: the engine
// needs the same fields from everybody, and a form that changes shape per
// person is a form nobody can test. But the consequence is that the app only
// ever learns what somebody thought to put on it in advance — which is fine
// for "5 kg abnehmen" and useless for a goal nobody anticipated.
//
// So once, after the intake is saved and before the plan is proposed, the
// model sees the whole picture and may name up to three things it is missing.
// Usually it names none, and that is the outcome the prompt and the checks
// both push towards: three obligatory questions at the end of a ten-minute
// form is where people leave.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import type { IntakeQuestion } from '@/lib/ai/schemas'
import type { IntakeAnswer, PlanInput } from '@/lib/domain/types'

/**
 * How long the model gets before the app moves on without it.
 *
 * Much shorter than the proposal budget, because this call sits between a
 * person pressing a button and their plan appearing. A question that arrives
 * after twelve seconds of blank screen is worse than no question — and no
 * question is a perfectly good outcome anyway, which is what makes cutting it
 * short honest rather than a compromise.
 */
const QUESTION_BUDGET_MS = 8_000

/**
 * Asks once per goal. Returns the questions, or an empty list.
 *
 * Never throws. No consent, no key, a refusal, a failed safety check, a
 * timeout and "the model had nothing to ask" all end the same way: an empty
 * list, and the plan is built from the intake as given.
 */
export async function askIntakeQuestions(
  profileId: string,
  input: PlanInput,
): Promise<IntakeQuestion[]> {
  try {
    return await run(profileId, input)
  } catch {
    return []
  }
}

async function run(profileId: string, input: PlanInput): Promise<IntakeQuestion[]> {
  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id, intake_asked_at')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()

  // Asked already. Re-asking would cost a call and, because the model is not
  // deterministic, would produce a different set of questions for the same
  // intake — so the answers somebody gave would stop matching what was asked.
  if (!goal.data || goal.data.intake_asked_at !== null) return []

  const adapter = await adapterFor(profileId, QUESTION_BUDGET_MS)
  const result = await adapter.askQuestions(input)

  // Stamped even when nothing came back, for the same reason ai_proposal_at is:
  // "asked, no questions" and "never asked" have to be distinguishable, or the
  // app retries for ever against a model that is perfectly happy.
  await supabase
    .from('goals')
    .update({ intake_asked_at: new Date().toISOString() })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)

  if (!result.ok || !result.value.needsMore) return []
  return result.value.questions
}

/**
 * Stores what came back, skipped answers included.
 *
 * A skipped question is written as `answer: null` rather than dropped. The
 * distinction is the same one `unknown` carries everywhere else in this
 * product: "was asked, chose not to say" is information, and silently losing
 * it would let the app ask again later as though it never had.
 */
export async function saveIntakeAnswers(
  profileId: string,
  answers: IntakeAnswer[],
): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('goals')
    .update({ intake_answers: answers })
    .eq('profile_id', profileId)
    .eq('status', 'active')
  return error === null
}
