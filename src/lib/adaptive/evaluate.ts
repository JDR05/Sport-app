// Schritt 5 and 6: measure against the baseline, then decide.
//
// Two rules shape this module, and both come from ADR-012 and
// docs/ADAPTIVE_ENGINE.md:
//
//   * Only behaviour is evaluated. The type of `observed` makes an outcome
//     metric a compile error, not a code review finding. Five kilograms over
//     twelve weeks is roughly 0.4 kg a week — below daily fluctuation — so a
//     two-week experiment judged on weight is noise, and a rule derived from
//     noise poisons the personal model permanently.
//   * An improvement below the noise floor is "no effect", never a success.
//     Declaring small movement a win is how a system ends up confidently wrong
//     about someone.

import { MAX_EXPERIMENT_WEEKS, MIN_EFFECT, MIN_EXPERIMENT_INSTANCES } from './constants'
import { daysBetween } from '@/lib/engine/dates'
import type { BehaviorMetric, Evaluation, Experiment } from './types'

/**
 * @param today optional; without it an experiment can never be given up on,
 *   which is how one stayed open for four months holding the only slot
 */
export function evaluateExperiment(
  experiment: Experiment,
  observed: BehaviorMetric,
  resolvedInstances: number,
  today?: string,
): Evaluation {
  const baselineValue = experiment.baseline.value
  const observedValue = observed.value
  const effect = round2(observedValue - baselineValue)

  // Too little happened to read anything into it. `continue` is an honest
  // answer; guessing is not.
  if (resolvedInstances < MIN_EXPERIMENT_INSTANCES) {
    // ...but only while the experiment can still be read at all. `continue`
    // extends by another fortnight, and nothing stopped it doing that for
    // ever: someone who put the app down for months came back to a test still
    // running, still holding the only slot, still shaping every plan through
    // its trial rule — on a fortnight that had long since fallen out of the
    // window the result would be read in.
    //
    // Abandoning it is not the same as rejecting it. The change did not fail;
    // we never found out. Saying so lets a new experiment start from where the
    // person actually is now.
    if (today !== undefined && outOfTime(experiment, today)) {
      return {
        decision: 'discard',
        abandoned: true,
        baselineValue,
        observedValue,
        effect,
        resolvedInstances,
        reason:
          `Dieser Test lief seit ${MAX_EXPERIMENT_WEEKS} Wochen und es sind zu wenige ` +
          `Aktionen zusammengekommen, um ihn auszuwerten. Er wird beendet — nicht, ` +
          `weil die Änderung nichts gebracht hätte, sondern weil sich das nicht mehr ` +
          `sagen lässt. Der Platz ist wieder frei für einen neuen Versuch.`,
      }
    }

    return {
      decision: 'continue',
      baselineValue,
      observedValue,
      effect,
      resolvedInstances,
      reason:
        `In diesem Zeitraum sind nur ${resolvedInstances} Aktionen zusammengekommen. ` +
        `Das reicht noch nicht für eine Aussage — der Test läuft weiter.`,
    }
  }

  if (effect >= MIN_EFFECT) {
    return {
      decision: 'keep',
      baselineValue,
      observedValue,
      effect,
      resolvedInstances,
      reason:
        `Deine Umsetzungsquote ist von ${percent(baselineValue)} auf ${percent(observedValue)} ` +
        `gestiegen. Die Änderung bleibt.`,
    }
  }

  if (effect <= -MIN_EFFECT) {
    return {
      decision: 'discard',
      baselineValue,
      observedValue,
      effect,
      resolvedInstances,
      reason:
        `Mit der Änderung lief es schlechter (${percent(observedValue)} statt ` +
        `${percent(baselineValue)}). Sie wird zurückgenommen.`,
    }
  }

  return {
    decision: 'discard',
    baselineValue,
    observedValue,
    effect,
    resolvedInstances,
    reason:
      `Der Unterschied ist zu klein, um echt zu sein (${percent(baselineValue)} → ` +
      `${percent(observedValue)}). Das zählt als kein Effekt, nicht als Erfolg — ` +
      `die Änderung wird nicht übernommen.`,
  }
}

/**
 * True once an experiment has been open longer than its result can be read
 * against its own baseline.
 */
export function outOfTime(experiment: Experiment, today: string): boolean {
  return daysBetween(experiment.startDate, today) > MAX_EXPERIMENT_WEEKS * 7
}

/** The status the experiment takes on after a decision. */
export function applyDecision(experiment: Experiment, evaluation: Evaluation): Experiment {
  switch (evaluation.decision) {
    case 'keep':
      return { ...experiment, status: 'adopted' }
    case 'discard':
      // `rejected` is a verdict on the change; `aborted` says there was none.
      // Filing an abandoned test as rejected would put a change nobody
      // measured into the record as one that failed.
      return { ...experiment, status: evaluation.abandoned ? 'aborted' : 'rejected' }
    case 'continue':
      return { ...experiment, status: 'extended' }
  }
}

function percent(n: number): string {
  return `${Math.round(n * 100)} %`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
