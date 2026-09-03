// Schemas for every AI output.
//
// Nothing from a model reaches the product without passing through here. Schema
// validation is the first gate; the plausibility checks in validate.ts are the
// second and the more important one — a schema-valid proposal can still be
// unsafe.

import { z } from 'zod'
import { GOAL_ARCHETYPES } from '@/lib/domain/types'

export const goalClassificationSchema = z.object({
  archetype: z.enum(GOAL_ARCHETYPES as unknown as [string, ...string[]]),
  /** How sure the model is. Low confidence falls back to the keyword classifier. */
  confidence: z.number().min(0).max(1),
  /** What the app should measure, when the goal implies a number at all. */
  metricKey: z.string().max(40).nullable(),
  unit: z.string().max(16).nullable(),
  /** Restated in the user's own words, for the app to show back to them. */
  restated: z.string().min(3).max(160),
  reasoning: z.string().min(10).max(400),
})

export type GoalClassification = z.infer<typeof goalClassificationSchema>

// ------------------------------------------------------- the plan levers ----

/**
 * One action the model proposes for the goal track.
 *
 * Note what is *not* in here: no date, no weekday, no time. The model says what
 * should happen and roughly how often; the engine decides when, because only
 * the engine knows the free slots, the rest days, the hard exclusions and the
 * ceiling per day. That split is what lets the model be genuinely creative
 * without being able to reach a single safety limit.
 *
 * `timesPerWeek` is capped at 5 rather than 7: a proposal that fills every day
 * leaves no room for the health baseline and no rest, and an action nobody can
 * skip is an action people abandon.
 */
export const proposedActionSchema = z.object({
  title: z.string().min(3).max(80),
  /** Must reference something the person actually told the app. */
  reasoning: z.string().min(20).max(400),
  /**
   * What the action does — the mechanism, not the person.
   *
   * `reasoning` says why *you*: "du hast dienstags abends Zeit und trainierst
   * lieber ohne Geräte". This says why *at all*: what happens in a body or a
   * week when somebody does this. Without it the app is a list of instructions
   * from an authority, which is the shape the product owner named and rejected
   * — "sonst wirkt das wirklich wie jede zweite KI App".
   *
   * Optional and nullable, deliberately. Proposals written before this field
   * existed are stored in `goals.ai_proposal` and must keep parsing: an
   * explanation nobody wrote is a missing sentence, not a broken plan.
   */
  effect: z.string().min(10).max(200).nullish(),
  domain: z.enum(['training', 'nutrition', 'movement', 'sleep', 'self_improvement', 'priority']),
  minutes: z.number().int().min(0).max(90),
  timesPerWeek: z.number().int().min(1).max(5),
  preferredSlot: z.enum(['early', 'midday', 'evening', 'any']),
})

export type ProposedAction = z.infer<typeof proposedActionSchema>

/**
 * What the model may contribute to a plan.
 *
 * `metricKey`/`unit` let it name a number for a goal nobody thought of — but it
 * never sets the metric *class*. Whether something counts as behaviour or as an
 * outcome stays deterministic, because the entire experiment logic rests on
 * that distinction (ADR-012).
 */
export const planProposalSchema = z.object({
  /** One sentence, shown above the plan. */
  headline: z.string().min(5).max(120),
  actions: z.array(proposedActionSchema).min(1).max(5),
  /** A behaviour worth counting for an unusual goal. Null when there is none. */
  metricKey: z.string().max(40).nullable(),
  metricLabel: z.string().max(40).nullable(),
  unit: z.string().max(16).nullable(),
  /** Why this set, as a whole. Shown when the user asks why. */
  reasoning: z.string().min(20).max(600),
})

export type PlanProposal = z.infer<typeof planProposalSchema>

// ------------------------------------------------------- the weekly note ----

/**
 * What the model may say once a week.
 *
 * `hasSomethingToSay` is the important field. A weekly feature that must
 * produce something every week produces filler in the weeks where nothing
 * happened, and filler is what turns a measuring instrument into a horoscope.
 * When it is false the app stores nothing and shows nothing.
 *
 * `basedOn` is required and non-empty for the same reason it is on every
 * insight: a statement nobody can trace back to real rows must not exist.
 */
export const weeklyNoteSchema = z.object({
  hasSomethingToSay: z.boolean(),
  observation: z.string().max(400),
  suggestion: z.string().max(400),
  question: z.string().max(200).nullable(),
  basedOn: z.array(z.string().max(80)).max(12),
})

export type WeeklyNote = z.infer<typeof weeklyNoteSchema>

// -------------------------------------------------- asking before planning ---

/**
 * One thing the model wants to know before it proposes anything.
 *
 * `why` is not decoration. A question whose purpose is invisible reads as a
 * form, and a form is the thing this app is not allowed to feel like — so the
 * screen shows what the answer would change, and a model that cannot say what
 * an answer would change has no business asking.
 *
 * `options` are tap-able answers, capped at four. This is a phone: three
 * free-text boxes at the end of a ten-minute intake is where people leave.
 * They are suggestions, never a closed list — typing something else is always
 * possible, and skipping is always possible, because a missing answer is
 * `unknown` and `unknown` is a supported state everywhere else in this product.
 */
export const intakeQuestionSchema = z.object({
  question: z.string().min(10).max(160),
  why: z.string().min(10).max(200),
  options: z.array(z.string().min(1).max(40)).max(4),
})

/**
 * What the model may ask before building a plan.
 *
 * `needsMore: false` is the expected answer for a complete intake, and it is
 * load-bearing in the same way `hasSomethingToSay` is on the weekly note: a
 * step that must produce questions produces filler ones, and a filler question
 * costs the person time and buys the plan nothing.
 *
 * Three is the ceiling. The model is picking what it would most like to know,
 * not conducting an interview.
 */
export const intakeQuestionsSchema = z.object({
  needsMore: z.boolean(),
  questions: z.array(intakeQuestionSchema).max(3),
})

export type IntakeQuestion = z.infer<typeof intakeQuestionSchema>
export type IntakeQuestions = z.infer<typeof intakeQuestionsSchema>

// ----------------------------------------------------- answering a question ---

/**
 * What the model may say when the person asks something.
 *
 * `canAnswer` is the field that keeps this honest, and it is the same idea as
 * `hasSomethingToSay` on the weekly note: a feature that must produce an
 * answer produces one whether or not the data supports it, and a confident
 * sentence about a week the model never saw is worse than "das weiß ich
 * nicht".
 *
 * `needs` is the other half of that, and it is the reason this feature is
 * interesting rather than just a chat box. When the answer is not in the data,
 * the model says what it would need to know — which is the app taking an
 * interest instead of shrugging.
 */
export const askAnswerSchema = z.object({
  canAnswer: z.boolean(),
  answer: z.string().max(700),
  /** What would have to be known. Only meaningful when `canAnswer` is false. */
  needs: z.string().max(200).nullable(),
  basedOn: z.array(z.string().max(80)).max(12),
})

export type AskAnswer = z.infer<typeof askAnswerSchema>
