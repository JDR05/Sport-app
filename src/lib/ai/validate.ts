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
const SLEEP_REDUCTION = [
  /weniger schlaf/i, /kürzer schlafen/i, /früher aufstehen um zu trainieren/i,
  /\bschlaf\w*\s+(kürzen|reduzieren|opfern)\b/i,
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
