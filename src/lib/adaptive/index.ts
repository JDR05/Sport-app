// The adaptive engine, as one pass over what actually happened.
//
// Pure, like the planning engine: observations and the plan input go in, an
// analysis comes out. No database, no clock, no network — so the entire
// learning loop, including the part that changes next week's plan, runs inside
// a test.
//
// The shape of the result encodes the two-tier design from
// docs/ADAPTIVE_ENGINE.md: `patch` is plan care and is always present, while
// `experiment` is the slow, statistical half and is usually null. Most weeks
// the honest output of this function is "a few small corrections, and nothing
// worth claiming yet".

import { detectDeviations } from './detect'
import { formHypothesis } from './hypothesis'
import { proposeExperiment } from './experiment'
import { refinePlan } from './refine'
import { attribute, type Attribution, type DayContext } from './attribution'
import type { Deviation, Experiment, Hypothesis, Insight, Observation, PlanPatch } from './types'
import { DOMAIN_LABELS } from './labels'
import type { PlanInput } from '@/lib/domain/types'

export type Analysis = {
  /** Everything the data supports, strongest first. Often empty. */
  deviations: Deviation[]
  /** The one pattern acted on this cycle, if any. */
  hypothesis: Hypothesis | null
  /** Null when nothing qualified, or when a change would break a safety limit. */
  experiment: Experiment | null
  patch: PlanPatch
  insights: Insight[]
}

export type AnalyzeOptions = {
  /**
   * True while an experiment is already running. One variable at a time is the
   * whole point; two concurrent experiments make both results unreadable.
   */
  experimentInFlight?: boolean
  /**
   * What the person said about their days. Optional, and absent means the
   * analysis simply says less — never that it guesses.
   */
  days?: DayContext[]
}

export function analyze(
  input: PlanInput,
  observations: Observation[],
  options: AnalyzeOptions = {},
): Analysis {
  const patch = refinePlan(observations, input.today)
  const deviations = detectDeviations(observations)

  // A pattern is stated together with what was different about those days.
  // Detection alone reports that Tuesdays go badly, and a shortfall with no
  // circumstance attached reads as a verdict on the person — which is the one
  // thing this product must never do.
  const context = (d: Deviation) =>
    attribute(d, options.days ?? [], input.schedule.commitments)

  const empty: Analysis = {
    deviations,
    hypothesis: null,
    experiment: null,
    patch,
    insights: [],
  }

  if (deviations.length === 0) return empty
  if (options.experimentInFlight) {
    return {
      ...empty,
      insights: deviations.slice(0, 1).flatMap((d) => [patternInsight(d), ...contextInsights(d, context(d))]),
    }
  }

  // Strongest contrast first, and the first one that yields both a changeable
  // cause and a safe experiment wins. The rest wait for the next cycle — the
  // user gets one thing to try, not a list.
  for (const deviation of deviations) {
    const hypothesis = formHypothesis(deviation, observations)
    if (!hypothesis) continue

    const experiment = proposeExperiment(hypothesis, input, observations)
    if (!experiment) continue

    return {
      deviations,
      hypothesis,
      experiment,
      patch,
      insights: [
        patternInsight(deviation),
        ...contextInsights(deviation, context(deviation)),
        hypothesisInsight(hypothesis),
      ],
    }
  }

  // A pattern that produced no safe experiment is still worth naming. Saying
  // "this is what I see" without a proposal is better than silence and much
  // better than an unsafe suggestion.
  return {
    ...empty,
    insights: [patternInsight(deviations[0]), ...contextInsights(deviations[0], context(deviations[0]))],
  }
}

/**
 * The circumstances, as insights. They carry the deviation's own evidence: the
 * days being talked about are the days the pattern was measured on, so there is
 * nothing separate to point at.
 */
function contextInsights(deviation: Deviation, found: Attribution[]): Insight[] {
  return found.map((a) => ({
    kind: 'pattern' as const,
    statement: a.statement,
    evidence: deviation.evidence,
  }))
}

function patternInsight(deviation: Deviation): Insight {
  const where = deviation.domain ? ` im Bereich ${DOMAIN_LABELS[deviation.domain]}` : ''
  return {
    kind: 'pattern',
    statement:
      `${deviation.missed} von ${deviation.resolved} Aktionen${where} sind hier ausgefallen ` +
      `(${percent(deviation.missRate)}), sonst ${percent(deviation.comparisonMissRate)}. ` +
      `Beobachtet über ${deviation.distinctWeeks} Wochen.`,
    evidence: deviation.evidence,
  }
}

function hypothesisInsight(hypothesis: Hypothesis): Insight {
  return {
    kind: 'pattern',
    statement: hypothesis.statement,
    evidence: hypothesis.deviation.evidence,
  }
}

function percent(n: number): string {
  return `${Math.round(n * 100)} %`
}

export { detectDeviations, planningErrors, completionRate } from './detect'
export { formHypothesis, proposedRuleFor } from './hypothesis'
export { proposeExperiment, trialRuleOf, domainOfMetricKey, decline, start } from './experiment'
export { evaluateExperiment, applyDecision, outOfTime } from './evaluate'
export { derivePersonalRule, reinforce, activeRules, mergeRule } from './rules'
export { recheckRules, fadedStatement, type RuleVerdict } from './recheck'
export { refinePlan } from './refine'
export { attribute, type Attribution, type DayContext } from './attribution'
export type {
  BehaviorMetric,
  Deviation,
  Evaluation,
  Experiment,
  Hypothesis,
  Insight,
  Observation,
  PlanPatch,
} from './types'
