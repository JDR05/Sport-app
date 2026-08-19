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

import { MIN_EFFECT, MIN_EXPERIMENT_INSTANCES } from './constants'
import type { BehaviorMetric, Evaluation, Experiment } from './types'

export function evaluateExperiment(
  experiment: Experiment,
  observed: BehaviorMetric,
  resolvedInstances: number,
): Evaluation {
  const baselineValue = experiment.baseline.value
  const observedValue = observed.value
  const effect = round2(observedValue - baselineValue)

  // Too little happened to read anything into it. `continue` is an honest
  // answer; guessing is not.
  if (resolvedInstances < MIN_EXPERIMENT_INSTANCES) {
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

/** The status the experiment takes on after a decision. */
export function applyDecision(experiment: Experiment, evaluation: Evaluation): Experiment {
  switch (evaluation.decision) {
    case 'keep':
      return { ...experiment, status: 'adopted' }
    case 'discard':
      return { ...experiment, status: 'rejected' }
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
