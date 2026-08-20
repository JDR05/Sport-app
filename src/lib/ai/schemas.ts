// Schemas for every AI output.
//
// Nothing from a model reaches the product without passing through here. Schema
// validation is the first gate; the plausibility checks in validate.ts are the
// second and the more important one — a schema-valid suggestion can still be
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

export const suggestionSchema = z.object({
  title: z.string().min(3).max(80),
  /** Why this, for this person. Must reference something they told the app. */
  reasoning: z.string().min(20).max(400),
  domain: z.enum(['training', 'nutrition', 'movement', 'sleep', 'self_improvement', 'priority']),
  /** Additive only: something to start, never something to stop. */
  effortMinutes: z.number().int().min(0).max(90),
})

export const suggestionsSchema = z.object({
  suggestions: z.array(suggestionSchema).min(1).max(3),
  /** One sentence the app may show above the plan. */
  headline: z.string().min(5).max(120),
})

export type Suggestion = z.infer<typeof suggestionSchema>
export type Suggestions = z.infer<typeof suggestionsSchema>

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
