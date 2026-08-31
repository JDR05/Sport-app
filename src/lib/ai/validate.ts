// Plausibility checks.
//
// The schema proves the shape. This proves the content is allowed. A
// schema-valid proposal can still tell someone to skip dinner, and that is the
// failure mode that matters.
//
// Violations are rejected, never repaired. Silently fixing a bad proposal
// would hide that the model produced one.

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
 * Plausibility for a plan proposal — the only path by which model-written text
 * reaches a person.
 *
 * A proposed action becomes something they are asked to *do* every week, which
 * is why the effort and frequency limits sit here rather than being left to
 * the reader's judgement.
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
