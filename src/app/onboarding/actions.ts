'use server'

// Taking a finished onboarding and storing it.
//
// The client sends its answers, so they are validated here before anything is
// written — a server action is a public HTTP endpoint, and "our own form posts
// to it" is not a security property. The profile id comes from the verified
// session, never from the payload; row level security enforces the same thing
// again in Postgres.
//
// The schema is the one the engine already relies on, so anything that gets
// through here is something generatePlan can plan for.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/session'
import { saveOnboarding } from '@/lib/db/save-onboarding'
import { loadPlanInput } from '@/lib/db/plan-input'
import { askIntakeQuestions, saveIntakeAnswers } from '@/lib/db/intake-questions'
import { withProposal } from '@/lib/db/propose'
import { ensureCommitmentInsights } from '@/lib/db/commitment-insights'
import { adoptProposalIntoCurrentWeek } from '@/lib/db/adopt-proposal'
import { serverToday } from '@/lib/db/today'
import { onboardingSchema, refusal } from './schema'
import type { IntakeQuestion } from '@/lib/ai/schemas'

export type CompleteResult =
  | { error: string }
  /**
   * Saved. `questions` is what the model would still like to know — usually
   * empty, which is the outcome the prompt pushes towards.
   *
   * Deliberately does not redirect any more. The intake has to be stored
   * before the model can be shown it, and the person has to be able to answer
   * before the plan is built from those answers — so completion is two steps,
   * and this is the first.
   */
  | { questions: IntakeQuestion[] }

export async function completeOnboarding(payload: unknown): Promise<CompleteResult> {
  const user = await requireUser()

  const parsed = onboardingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: refusal(parsed.error.issues) }
  }

  const saved = await saveOnboarding(user.id, parsed.data)
  if (!saved.ok) {
    return { error: 'Speichern hat nicht geklappt. Versuch es bitte noch einmal.' }
  }

  const input = await loadPlanInput(user.id)
  if (!input) return { questions: [] }

  // Never allowed to fail the onboarding: everything is already saved, and an
  // empty list is the documented normal case anyway.
  const questions = await askIntakeQuestions(user.id, {
    ...input,
    today: await serverToday(),
  })
  return { questions }
}

const answerSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().max(300).nullable(),
})

/**
 * The second half: store the answers, ask for the proposal, go to Today.
 *
 * Also the path taken when there were no questions at all — with an empty
 * array — so there is exactly one place where a plan comes into existence at
 * the end of an onboarding, rather than two that can drift apart.
 */
export async function finishOnboarding(payload: unknown): Promise<CompleteResult> {
  const user = await requireUser()

  const parsed = z.array(answerSchema).max(3).safeParse(payload)
  if (!parsed.success) {
    return { error: 'Deine Antworten konnten nicht gespeichert werden. Versuch es noch einmal.' }
  }

  // A failure here loses three answers, not the intake. Worth continuing for:
  // stopping would leave somebody with a saved profile and no plan, which is
  // the one state the app has no screen for.
  if (parsed.data.length > 0) await saveIntakeAnswers(user.id, parsed.data)

  // Ask the model here, not on the first page load.
  //
  // It is the same ask — once per goal, ADR-041 — at the one moment the person
  // is already waiting on purpose: the button says "Plan wird gebaut". Inside
  // ensureWeekPlan it sat in front of a blank screen with the full
  // twenty-second budget, which is what made the app look like it had frozen.
  //
  // Never allowed to fail the onboarding. Everything is saved by this point,
  // and a plan without a proposal is the documented, fully usable state.
  try {
    const input = await loadPlanInput(user.id)
    if (input) {
      const withToday = { ...input, today: await serverToday() }
      // Both in one waiting moment. The person tapped "Plan erstellen" and is
      // already waiting on purpose; asking what their own training is worth
      // costs one more call and decides how the whole plan is shaped.
      await Promise.all([
        withProposal(user.id, withToday),
        ensureCommitmentInsights(user.id, withToday),
      ])
      // If a week was already materialised — somebody who signed up, looked
      // around, and finished the AI step afterwards — it takes the actions
      // now instead of listing them on Insights alone.
      await adoptProposalIntoCurrentWeek(user.id, withToday.today)
    }
  } catch {
    // Deliberately swallowed. See above.
  }

  // The app layout reads the plan on the server, so its cache has to go.
  revalidatePath('/', 'layout')
  redirect('/today')
}
