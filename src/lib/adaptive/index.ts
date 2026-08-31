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
import { detectStrengths, type Strength } from './strengths'
import { attribute, type Attribution, type DayContext } from './attribution'
import type { Deviation, Experiment, Hypothesis, Insight, Observation, PlanPatch } from './types'
import { DOMAIN_LABELS, SLOT_LABELS, WEEKDAY_LABELS } from './labels'
import type { PlanDomain, PlanInput, TimeSlot, Weekday } from '@/lib/domain/types'

export type Analysis = {
  /** Everything the data supports, strongest first. Often empty. */
  deviations: Deviation[]
  /**
   * Where this person's plan reliably works, strongest first.
   *
   * Separate from deviations rather than a signed version of them, because
   * they are not judged by the same bar. A shortfall is worth naming as soon
   * as it is real; a strength is only worth naming when it is unmistakable.
   */
  strengths: Strength[]
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
  /**
   * The current week in full, days still ahead included.
   *
   * Only plan care uses it, and it needs it: choosing a day to move an action
   * onto means knowing what is already on the days it is choosing between.
   * Detection must not see them — an action that has not happened yet is not
   * evidence — so this is separate from `observations` rather than folded in.
   */
  week?: Observation[]
}

export function analyze(
  input: PlanInput,
  observations: Observation[],
  options: AnalyzeOptions = {},
): Analysis {
  const patch = refinePlan(options.week ?? observations, input.today)
  const deviations = detectDeviations(observations)
  const strengths = detectStrengths(observations)

  // A pattern is stated together with what was different about those days.
  // Detection alone reports that Tuesdays go badly, and a shortfall with no
  // circumstance attached reads as a verdict on the person — which is the one
  // thing this product must never do.
  const context = (d: Deviation) =>
    attribute(d, options.days ?? [], input.schedule.commitments)

  // Said first, and said even when there is nothing else to say. Six weeks in
  // which the only thing the app has ever told someone is where they fall
  // short is how a health app becomes a second job.
  const good = strengths.slice(0, 1).map(strengthInsight)

  const empty: Analysis = {
    deviations,
    strengths,
    hypothesis: null,
    experiment: null,
    patch,
    insights: good,
  }

  if (deviations.length === 0) return empty
  if (options.experimentInFlight) {
    return {
      ...empty,
      insights: [
        ...good,
        ...deviations.slice(0, 1).flatMap((d) => [patternInsight(d), ...contextInsights(d, context(d))]),
      ],
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
      strengths,
      hypothesis,
      experiment,
      patch,
      insights: [
        ...good,
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
    insights: [
      ...good,
      patternInsight(deviations[0]),
      ...contextInsights(deviations[0], context(deviations[0])),
    ],
  }
}

/**
 * A strength, in the person's own week.
 *
 * Never a comparison to other people and never praise for effort — it names
 * when their plan works, with the numbers behind it, the same way a pattern
 * does. "Du bist toll" is not something a measuring instrument may say.
 */
function strengthInsight(strength: Strength): Insight {
  return {
    kind: 'progress',
    statement:
      `${bucketLabel(strength)}: ${strength.done} von ${strength.resolved} Aktionen umgesetzt ` +
      `(${percent(strength.rate)}), sonst ${percent(strength.comparisonRate)}. ` +
      `Über ${strength.distinctWeeks} Wochen — darauf lässt sich bauen.`,
    evidence: strength.evidence,
  }
}

/** How a bucket is named on screen, per axis. */
function bucketLabel(strength: Strength): string {
  switch (strength.dimension) {
    case 'weekday':
      return WEEKDAY_LABELS[strength.bucket as Weekday] ?? strength.bucket
    case 'time_slot':
      return SLOT_LABELS[strength.bucket as TimeSlot] ?? strength.bucket
    case 'domain':
      return DOMAIN_LABELS[strength.bucket as PlanDomain] ?? strength.bucket
    case 'duration':
      return strength.bucket === 'long' ? 'Längere Einheiten' : 'Kürzere Einheiten'
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
export { detectStrengths, type Strength } from './strengths'
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
