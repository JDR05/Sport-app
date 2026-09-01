// The AI adapter contract.
//
// Three implementations exist: a deterministic mock (default, no key needed), a
// Claude adapter, and a null adapter used to prove the product works with no AI
// at all. Which one runs is configuration, not a decision the calling code makes.

import type { GoalClassification, IntakeQuestions, PlanProposal, WeeklyNote } from './schemas'
import type { WeeklyNoteContext } from './tasks'
import type { PlanInput } from '@/lib/domain/types'

/** Never throws. A failed call is a value, so callers cannot forget to handle it. */
export type AiResult<T> =
  | { ok: true; value: T; source: 'ai' }
  | { ok: false; reason: AiFailure; detail: string }

export type AiFailure =
  | 'no_api_key'
  | 'timeout'
  | 'invalid_json'
  | 'schema_invalid'
  | 'implausible'
  | 'api_error'
  | 'disabled'
  // Not a fault. Nobody agreed to send this person's data to a model, so
  // nothing was sent. Distinct from 'disabled' so the app can say which of
  // the two it is, and offer the checkbox rather than a shrug.
  | 'no_consent'

export interface AiAdapter {
  readonly name: string
  classifyGoal(rawText: string): Promise<AiResult<GoalClassification>>
  /**
   * Actions for the plan itself — the lever from ADR-041. Takes the input
   * only, not a plan: it runs *before* one exists, because for an unusual goal
   * it is what the plan will be built from.
   */
  proposePlan(input: PlanInput): Promise<AiResult<PlanProposal>>
  /**
   * The ongoing half: one observation and one suggestion per week, from this
   * person's actual data — including the free text nothing else reads.
   *
   * Has no deterministic stand-in on purpose. A rules-based "tip" would be the
   * generic filler the whole feature exists to avoid, so without a model this
   * simply does not appear and the deterministic insights stand alone.
   */
  weeklyNote(context: WeeklyNoteContext): Promise<AiResult<WeeklyNote>>
  /**
   * What the model would like to know before it plans — the one call where it
   * asks rather than answers.
   *
   * Also has no deterministic stand-in, and for a sharper reason than the
   * weekly note: a fixed list of questions is what the onboarding already is.
   * Asking the same three extra questions of everybody would be a longer form,
   * not a model noticing a gap.
   */
  askQuestions(input: PlanInput): Promise<AiResult<IntakeQuestions>>
}

export type AiConfig = {
  apiKey: string | undefined
  classifyModel: string
  proposeModel: string
  timeoutMs: number
}
