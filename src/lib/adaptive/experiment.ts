// Schritt 3 and 4: the smallest useful change, and only if it is safe.
//
// The safety check here is not a review of the proposal — it builds the plan
// the rule would actually produce and runs the real invariants against it. A
// proposal that would break a limit is never shown to the user, so there is no
// path by which accepting a suggestion makes a plan unsafe.

import { EXPERIMENT_DAYS } from './constants'
import { completionRate } from './detect'
import { proposedRuleFor } from './hypothesis'
import type { BehaviorMetric, Experiment, Hypothesis, Observation } from './types'
import { generatePlan } from '@/lib/engine'
import { planSignature, signatureDistance } from '@/lib/engine/signature'
import { PlanInvariantError } from '@/lib/engine/errors'
import { addDays } from '@/lib/engine/dates'
import type { PersonalRule, PlanDomain, PlanInput, PlanResult } from '@/lib/domain/types'

/**
 * Confidence a rule carries while it is only a proposal. It is high enough to
 * be applied by the planner during the trial — otherwise the experiment would
 * test nothing — and is replaced by the real value on adoption.
 */
const TRIAL_CONFIDENCE = 0.5

export function proposeExperiment(
  hypothesis: Hypothesis,
  input: PlanInput,
  observations: Observation[],
): Experiment | null {
  const proposed = proposedRuleFor(hypothesis.deviation, observations)
  if (!proposed) return null

  // Two questions, not one: is the plan this rule produces safe, and is it a
  // different plan at all.
  //
  // Only the first was ever asked. Three of the four rules the planner
  // understands could not move a plan in most weeks — a time-slot preference
  // needs a day that offers two bands, a lighter domain only touches the
  // baseline track, and avoiding a weekday governs where sessions are *placed*,
  // so it does nothing when that day holds daily routines. The engine proposed
  // them anyway, promising "14 Tage lang wird an diesem Wochentag nichts
  // geplant". The person accepted, opened Today, and found the same Wednesday —
  // and a fortnight later a coin flip was written into their Playbook as
  // something they had learned about themselves.
  //
  // Testing the rule against this person's actual week is the only honest gate:
  // whether a rule bites depends on their schedule, not on the rule.
  const rule = trialRule(proposed)
  const withRule = planWith(input, rule)
  if (!withRule) return null

  const before = planSignature(generatePlan(input))
  if (signatureDistance(before, planSignature(withRule)) === 0) return null

  const scope = scopeOf(hypothesis, observations)
  const baselineRate = completionRate(scope)
  // Nothing to compare against later means nothing to decide. Better to keep
  // observing than to run an experiment whose result cannot be read.
  if (baselineRate === null) return null

  const metricKey = metricKeyFor(hypothesis)
  const baseline: BehaviorMetric = {
    metricKey,
    metricClass: 'behavior',
    value: baselineRate,
  }

  return {
    hypothesis: hypothesis.statement,
    variable: hypothesis.variable,
    changeDescription: describeChange(hypothesis),
    proposedRule: proposed,
    baseline,
    metricKey,
    startDate: input.today,
    endDate: addDays(input.today, EXPERIMENT_DAYS),
    status: 'proposed',
    evidence: hypothesis.deviation.evidence,
  }
}

/**
 * The plan the rule would produce, or null if it would break a safety limit.
 *
 * A thrown PlanInvariantError is the answer, not an error to report — the
 * proposal is simply dropped and the user never learns it existed.
 */
function planWith(input: PlanInput, rule: PersonalRule): PlanResult | null {
  try {
    return generatePlan({ ...input, personalRules: [...input.personalRules, rule] })
  } catch (error) {
    if (error instanceof PlanInvariantError) return null
    throw error
  }
}

/**
 * The observations the experiment is measured on: the affected slice, not the
 * whole week. Comparing the whole week would drown a Wednesday effect in six
 * other days.
 */
function scopeOf(hypothesis: Hypothesis, observations: Observation[]): Observation[] {
  const { deviation } = hypothesis
  if (deviation.domain === null) return observations
  return observations.filter((o) => o.domain === deviation.domain)
}

function metricKeyFor(hypothesis: Hypothesis): string {
  const domain = hypothesis.deviation.domain
  return domain === null ? 'completion_rate' : `completion_rate.${domain}`
}

/**
 * The inverse of metricKeyFor, and deliberately next to it.
 *
 * The baseline is computed over one domain, so the observation it is later
 * compared against has to be narrowed the same way. When the two lived apart,
 * the evaluation measured the whole week against a single-domain baseline and
 * the difference between them was not an effect — it was the other domains.
 * Whether a rule enters the personal model turns on this, so both halves of
 * the key format stay in one place.
 */
export function domainOfMetricKey(metricKey: string): PlanDomain | null {
  const [, domain] = metricKey.split('.')
  return domain ? (domain as PlanDomain) : null
}

function describeChange(hypothesis: Hypothesis): string {
  const { deviation } = hypothesis
  switch (deviation.dimension) {
    case 'weekday':
      return `${EXPERIMENT_DAYS} Tage lang wird an diesem Wochentag nichts geplant. Alles andere bleibt gleich.`
    case 'time_slot':
      return `${EXPERIMENT_DAYS} Tage lang liegen die Aktionen zu einer anderen Tageszeit. Alles andere bleibt gleich.`
    case 'duration':
      return `${EXPERIMENT_DAYS} Tage lang sind die Einheiten kürzer. Anzahl und Tage bleiben gleich.`
    case 'domain':
      return `${EXPERIMENT_DAYS} Tage lang läuft dieser Bereich in kleinerem Umfang. Alles andere bleibt gleich.`
  }
}

/** The rule as it should be stored while the experiment runs. */
export function trialRuleOf(experiment: Experiment): PersonalRule {
  return trialRule(experiment.proposedRule)
}

function trialRule(proposed: { ruleKey: string; ruleValue: Record<string, unknown> }): PersonalRule {
  return {
    ruleKey: proposed.ruleKey,
    ruleValue: proposed.ruleValue,
    confidence: TRIAL_CONFIDENCE,
    // Marks it as under test rather than learned: the planner applies it, the
    // Playbook does not claim it, and it wins over an established rule of the
    // same key for as long as the experiment runs.
    trial: true,
  }
}

/**
 * The user declining is data, not a dead end: it says the change was wrong for
 * them, which is exactly what the model is supposed to learn.
 */
export function decline(experiment: Experiment): Experiment {
  return { ...experiment, status: 'rejected' }
}

export function start(experiment: Experiment): Experiment {
  return { ...experiment, status: 'running' }
}
