// Plausibility checks.
//
// The schema proves the shape. This proves the content is allowed. A
// schema-valid proposal can still tell someone to skip dinner, and that is the
// failure mode that matters.
//
// Violations are rejected, never repaired. Silently fixing a bad proposal
// would hide that the model produced one.

import type { GoalClassification, WeeklyNote } from './schemas'

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

/**
 * Advice that is generic is not advice.
 *
 * The whole claim of this feature is that it says something only this person's
 * data could produce. "Trink mehr Wasser", "bleib dran", "Schlaf ist wichtig"
 * are true of everyone, which makes them worthless here and indistinguishable
 * from a horoscope. A model under pressure to produce something every week
 * produces exactly these, so they are refused rather than trusted to the
 * prompt.
 *
 * Deliberately a short list of the actual offenders rather than a cleverness
 * detector: it catches the filler, and anything subtler is what `basedOn` and
 * the reviewer are for.
 */
const GENERIC_FILLER = [
  /\btrink(e)? (mehr|ausreichend|genug) wasser\b/i,
  /\bbleib dran\b/i, /\bdranbleiben lohnt\b/i,
  /\bschlaf ist wichtig\b/i, /\bbewegung ist wichtig\b/i,
  /\bjeder schritt z(ä|ae)hlt\b/i,
  /\bdu schaffst das\b/i, /\bsei stolz\b/i, /\bglaub an dich\b/i,
  /\bkleine schritte f(ü|ue)hren zum ziel\b/i,
  /\bh(ö|oe)r auf deinen k(ö|oe)rper\b/i,
]

/** Judging the person rather than naming what was different. */
const VERDICT = [
  /\bdisziplinlos\b/i, /\bfaul\b/i, /\bkeine disziplin\b/i,
  /\bdu musst dich\b/i, /\breiß dich\b/i, /\bausrede/i,
  /\bmangelnde motivation\b/i, /\bwillensschw/i,
]

/**
 * Plausibility for the weekly note.
 *
 * Same four families as a plan proposal — a note is text a person acts on, so
 * the rules cannot be softer just because it is not a plan item — plus the two
 * above, which only apply here: a proposal cannot be filler (it has to be an
 * action with minutes on it), and it is not written in the second person about
 * how the week went.
 */
export function checkWeeklyNote(value: WeeklyNote): Violation[] {
  const violations: Violation[] = []
  if (!value.hasSomethingToSay) return violations

  const texts = [value.observation, value.suggestion, value.question ?? '']
  for (const text of texts) {
    violations.push(...scan(text, RESTRICTIVE, 'additive_only'))
    violations.push(...scan(text, NUMERIC_HEALTH_CLAIM, 'no_numeric_health_claims'))
    violations.push(...scan(text, SLEEP_REDUCTION, 'never_less_sleep'))
    violations.push(...scan(text, MEDICAL, 'no_medical_claims'))
    violations.push(...scan(text, GENERIC_FILLER, 'not_generic'))
    violations.push(...scan(text, VERDICT, 'no_verdict_on_the_person'))
  }

  // Saying something means having something to point at. Without this the
  // model can produce a confident sentence about a week it never read.
  if (value.basedOn.length === 0) {
    violations.push({ rule: 'must_cite_evidence', detail: 'basedOn is empty' })
  }
  if (value.observation.trim().length < 20 || value.suggestion.trim().length < 20) {
    violations.push({ rule: 'too_thin', detail: 'observation or suggestion is a fragment' })
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
