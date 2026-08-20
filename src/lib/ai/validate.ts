// Plausibility checks.
//
// The schema proves the shape. This proves the content is allowed. A
// schema-valid suggestion can still tell someone to skip dinner, and that is the
// failure mode that matters.
//
// Violations are rejected, never repaired. Silently fixing a bad suggestion
// would hide that the model produced one.

import type { Suggestions } from './schemas'
import type { GoalClassification } from './schemas'

export type Violation = { rule: string; detail: string }

/** Restriction framing. Additive advice only — see docs/GOAL_ARCHETYPES.md. */
const RESTRICTIVE = [
  /\bverzicht/i, /\bverbot/i, /\bweglassen\b/i, /\bstreich/i,
  /\bkeine[nrs]?\s+\S+\s+mehr\b/i, /\bnicht mehr essen\b/i, /\btabu\b/i,
  /\bfasten\b/i, /\bcheat.?day\b/i,
]

/** The app computes numbers. A model that states them is out of its lane. */
const NUMERIC_HEALTH_CLAIM = [
  /\b\d{3,5}\s?(kcal|kalorien)\b/i,
  /\b\d+\s?(g|gramm)\s+(eiweiß|protein|kohlenhydrate|fett)\b/i,
  /\b\d+(\.\d+)?\s?kg\s+(abnehmen|zunehmen|in)\b/i,
]

/** Never, under any goal. */
// Word order in German is free, so a fixed phrase list leaks. "kürzer
// schlafen" was caught and "schlafe kürzer" was not — the same instruction,
// and the one rule CLAUDE.md states in absolute terms: never recommend less
// sleep, for any goal, for any reason. Both directions are matched now.
const SLEEP_REDUCTION = [
  /\bweniger\s+schlaf/i,
  /\bkürzer\s+schlaf/i,
  /\bschlaf\w*\s+(kürzer|kürzen|reduzieren|opfern|weniger)\b/i,
  /\bfrüher\s+auf(stehen|zustehen)\b.{0,40}\b(trainier|sport|laufen)/i,
  /\bnachts?\s+(durcharbeiten|wach bleiben)\b/i,
]

const MEDICAL = [
  /\bdiagnos/i, /\bheil(t|en|ung)\b/i, /\bkrankheit\b/i, /\bmedikament/i,
  /\bnahrungsergänzung/i, /\bsupplement/i, /\bpräparat/i,
]

function scan(text: string, patterns: RegExp[], rule: string): Violation[] {
  return patterns
    .filter((p) => p.test(text))
    .map((p) => ({ rule, detail: `"${text.slice(0, 80)}" matched ${p.source}` }))
}

/**
 * Plausibility for a plan proposal.
 *
 * The same rule set the suggestions path uses, applied to the fields that
 * actually reach a plan. Stricter in one place: a proposed action becomes
 * something the person is asked to *do* every week, so an unrealistic duration
 * matters more than in a piece of advice they can ignore.
 */
export function checkProposal(proposal: {
  headline: string
  reasoning: string
  actions: Array<{ title: string; reasoning: string; minutes: number; timesPerWeek: number }>
}): Violation[] {
  const violations: Violation[] = []

  const texts = [
    proposal.headline,
    proposal.reasoning,
    ...proposal.actions.flatMap((a) => [a.title, a.reasoning]),
  ]
  for (const text of texts) {
    violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(text, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(text, MEDICAL, 'no_medical_claims'))
  }

  for (const [index, action] of proposal.actions.entries()) {
    const where = `action[${index}]`

    if (action.minutes > 45) {
      violations.push({
        rule: 'realistic_effort',
        detail: `${where}: ${action.minutes} min is more than someone keeps up weekly`,
      })
    }

    // Something demanded every single day is the first thing dropped, and its
    // failure then reads as a behavioural pattern that is really a planning one.
    if (action.timesPerWeek > 5) {
      violations.push({ rule: 'too_frequent', detail: `${where}: ${action.timesPerWeek}×/week` })
    }
  }

  return violations
}

export function checkSuggestions(value: Suggestions): Violation[] {
  const violations: Violation[] = []

  for (const s of [value.headline, ...value.suggestions.flatMap((x) => [x.title, x.reasoning])]) {
    violations.push(...scan(s, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(s, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(s, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(s, MEDICAL, 'no_medical_claims'))
  }

  // A suggestion nobody can fit into a day is not a suggestion.
  for (const s of value.suggestions) {
    if (s.effortMinutes > 45) {
      violations.push({ rule: 'realistic_effort', detail: `${s.title}: ${s.effortMinutes} min` })
    }
  }

  return violations
}

export function checkClassification(value: GoalClassification): Violation[] {
  const violations: Violation[] = []
  violations.push(...scan(value.restated, MEDICAL, 'no_medical_claims'))
  violations.push(...scan(value.reasoning, MEDICAL, 'no_medical_claims'))

  // A metric without a unit, or a unit without a metric, is half an answer.
  if ((value.metricKey === null) !== (value.unit === null)) {
    violations.push({
      rule: 'metric_pair',
      detail: `metricKey=${value.metricKey} unit=${value.unit}`,
    })
  }

  return violations
}
