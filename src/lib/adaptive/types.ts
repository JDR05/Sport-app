// Types of the adaptive engine.
//
// The pipeline is deliberately a chain of pure functions over plain data:
// observations → deviations → hypotheses → experiments → decisions → rules.
// Nothing here touches a database or a clock, so the whole learning loop is
// testable in a single process.

import type {
  MetricClass,
  PlanDomain,
  PlanItemStatus,
  TimeSlot,
} from '@/lib/domain/types'

/**
 * One planned action and what became of it. This is the only input detection
 * ever sees — deliberately not the plan object, because learning happens on
 * what actually occurred.
 */
export type Observation = {
  itemId: string
  /** ISO date the action was planned for. */
  scheduledOn: string
  domain: PlanDomain
  track: 'goal' | 'baseline'
  title: string
  timeSlot: TimeSlot | null
  plannedDurationMin: number | null
  status: PlanItemStatus
}

/** The axes detection looks along. Each yields at most one deviation. */
export type DeviationDimension = 'weekday' | 'time_slot' | 'duration' | 'domain'

/**
 * A repeated, evidenced shortfall along one axis. Carries its own evidence
 * because a suggestion whose underlying data cannot be shown must not exist —
 * that is the fourth architecture principle, not a nicety.
 */
export type Deviation = {
  dimension: DeviationDimension
  /** The value of that dimension, e.g. 'wed' or 'evening'. */
  bucket: string
  domain: PlanDomain | null
  resolved: number
  missed: number
  missRate: number
  /** Miss rate everywhere else along the same axis. */
  comparisonMissRate: number
  distinctWeeks: number
  /** Item ids the numbers came from. */
  evidence: string[]
}

/**
 * A guess at a *changeable* cause, in the user's language. "The user is
 * unmotivated" is not expressible here on purpose: `variable` has to name
 * something the plan can actually alter.
 */
export type Hypothesis = {
  deviation: Deviation
  /** German, addressed to the user, never blaming. */
  statement: string
  /** Exactly one thing an experiment may change. */
  variable: string
}

export type ExperimentStatus =
  | 'proposed' | 'running' | 'evaluating' | 'adopted' | 'rejected' | 'extended' | 'aborted'

/**
 * A behavioural metric. `metricClass` is a literal, not the enum, so passing a
 * weight measurement into the evaluator is a compile error rather than a
 * runtime check that someone can forget. ADR-012.
 */
export type BehaviorMetric = {
  metricKey: string
  metricClass: 'behavior'
  value: number
}

/**
 * Narrows a stored measurement to something the evaluator will accept. An
 * outcome metric returns null here and simply never reaches an experiment.
 */
export function asBehaviorMetric(m: {
  metricKey: string
  metricClass: MetricClass
  value: number
}): BehaviorMetric | null {
  return m.metricClass === 'behavior'
    ? { metricKey: m.metricKey, metricClass: 'behavior', value: m.value }
    : null
}

export type Experiment = {
  hypothesis: string
  /** The single variable under test. */
  variable: string
  changeDescription: string
  /** The rule that would be adopted if the experiment succeeds. */
  proposedRule: { ruleKey: string; ruleValue: Record<string, unknown> }
  baseline: BehaviorMetric
  metricKey: string
  startDate: string
  endDate: string
  status: ExperimentStatus
  evidence: string[]
}

export type InsightKind = 'pattern' | 'progress' | 'experiment_result' | 'warning'

/**
 * Something the system is prepared to say out loud. `evidence` is non-empty by
 * construction, matching the database constraint: an insight nobody can trace
 * back to real rows is exactly the kind of confident nonsense this product is
 * built to avoid.
 */
export type Insight = {
  kind: InsightKind
  statement: string
  evidence: string[]
}

export type ExperimentDecision = 'keep' | 'discard' | 'continue'

export type Evaluation = {
  decision: ExperimentDecision
  baselineValue: number
  observedValue: number
  /** observed − baseline, in the metric's own units. */
  effect: number
  resolvedInstances: number
  /** German, shown to the user with the decision. */
  reason: string
  /**
   * The experiment was given up on rather than decided.
   *
   * Only ever set together with `discard`, and the two say different things:
   * discard means the change did not help, abandoned means we never found
   * out. The distinction reaches the database as the `aborted` status, so a
   * result nobody could read is not filed as a change that failed.
   */
  abandoned?: true
}

/**
 * Plan care: small, deterministic, provisional. Never produces a personal rule
 * — that is ADR-013, and it is why this type has no rule field.
 */
export type PlanPatch = {
  moves: Array<{ itemId: string; fromDate: string; toDate: string; reason: string }>
  removals: Array<{ itemId: string; reason: string }>
  /** Always true: plan care is a working guess, and the UI says so. */
  provisional: true
  notes: string[]
}
