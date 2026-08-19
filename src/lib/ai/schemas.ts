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
