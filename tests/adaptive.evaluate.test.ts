// Evaluation is where a learning system either stays honest or starts
// flattering itself. Half of these tests assert that a result is *not* called
// a success.

import { describe, expect, it } from 'vitest'
import {
  applyDecision,
  activeRules,
  derivePersonalRule,
  evaluateExperiment,
  formHypothesis,
  detectDeviations,
  mergeRule,
  proposeExperiment,
  reinforce,
  start,
  decline,
  type BehaviorMetric,
  type Experiment,
} from '@/lib/adaptive'
import {
  INITIAL_RULE_CONFIDENCE,
  MAX_RULE_CONFIDENCE,
  MIN_EFFECT,
  MIN_EXPERIMENT_INSTANCES,
  MIN_RULE_CONFIDENCE,
} from '@/lib/adaptive/constants'
import { asBehaviorMetric } from '@/lib/adaptive/types'
import type { PersonalRule } from '@/lib/domain/types'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import { WEDNESDAY_PROBLEM } from './fixtures/observations'

const input = makeInput(PROFILES[3], GOALS[1])

function runningExperiment(): Experiment {
  const deviation = detectDeviations(WEDNESDAY_PROBLEM).find((d) => d.dimension === 'weekday')!
  const hypothesis = formHypothesis(deviation, WEDNESDAY_PROBLEM)!
  return start(proposeExperiment(hypothesis, input, WEDNESDAY_PROBLEM)!)
}

function observed(value: number): BehaviorMetric {
  return { metricKey: 'completion_rate.training', metricClass: 'behavior', value }
}

describe('metric class', () => {
  it('lets a behaviour metric through', () => {
    expect(asBehaviorMetric({ metricKey: 'completion_rate', metricClass: 'behavior', value: 0.8 }))
      .not.toBeNull()
  })

  it('refuses an outcome metric', () => {
    // Weight over two weeks is noise; a rule derived from it would poison the
    // personal model permanently. The database enforces the same rule, and the
    // evaluator's signature makes it a compile error on top. ADR-012.
    expect(asBehaviorMetric({ metricKey: 'weight_kg', metricClass: 'outcome', value: 84.2 }))
      .toBeNull()
  })
})

describe('decisions', () => {
  const experiment = runningExperiment()
  const baseline = experiment.baseline.value

  it('keeps a change that clears the noise floor', () => {
    const result = evaluateExperiment(experiment, observed(baseline + MIN_EFFECT + 0.1), 8)
    expect(result.decision).toBe('keep')
    expect(applyDecision(experiment, result).status).toBe('adopted')
  })

  it('calls a small improvement no effect, not a success', () => {
    const result = evaluateExperiment(experiment, observed(baseline + MIN_EFFECT - 0.05), 8)
    expect(result.decision).toBe('discard')
    expect(result.reason).toContain('kein Effekt')
  })

  it('discards a change that made things worse', () => {
    const result = evaluateExperiment(experiment, observed(Math.max(0, baseline - 0.4)), 8)
    expect(result.decision).toBe('discard')
  })

  it('keeps testing when too little happened to read', () => {
    const result = evaluateExperiment(
      experiment,
      observed(1),
      MIN_EXPERIMENT_INSTANCES - 1,
    )
    expect(result.decision).toBe('continue')
    expect(applyDecision(experiment, result).status).toBe('extended')
  })

  it('explains itself in the language of the person reading it', () => {
    const result = evaluateExperiment(experiment, observed(baseline + 0.3), 8)
    expect(result.reason.length).toBeGreaterThan(20)
    expect(result.reason).toMatch(/%/)
  })
})

describe('what may become a personal rule', () => {
  const experiment = runningExperiment()
  const baseline = experiment.baseline.value

  it('a confirmed experiment does', () => {
    const result = evaluateExperiment(experiment, observed(baseline + 0.4), 8)
    const rule = derivePersonalRule(experiment, result)
    expect(rule).toEqual({
      ruleKey: 'avoid_weekday',
      ruleValue: { weekday: 'wed' },
      confidence: INITIAL_RULE_CONFIDENCE,
    })
  })

  it('a discarded one does not', () => {
    const result = evaluateExperiment(experiment, observed(baseline), 8)
    expect(derivePersonalRule(experiment, result)).toBeNull()
  })

  it('an undecided one does not', () => {
    const result = evaluateExperiment(experiment, observed(1), 1)
    expect(derivePersonalRule(experiment, result)).toBeNull()
  })

  it('one the user declined does not, however good the numbers look', () => {
    const declined = decline(experiment)
    const result = evaluateExperiment(declined, observed(baseline + 0.5), 8)
    expect(result.decision).toBe('keep')
    expect(derivePersonalRule(declined, result)).toBeNull()
  })

  it('a mere proposal never does', () => {
    const proposal: Experiment = { ...experiment, status: 'proposed' }
    const result = evaluateExperiment(proposal, observed(baseline + 0.5), 8)
    expect(derivePersonalRule(proposal, result)).toBeNull()
  })
})

describe('rules can weaken again', () => {
  const rule: PersonalRule = {
    ruleKey: 'avoid_weekday',
    ruleValue: { weekday: 'wed' },
    confidence: 0.6,
  }

  it('grows with agreeing evidence but never reaches certainty', () => {
    let current = rule
    for (let i = 0; i < 20; i++) current = reinforce(current, true)
    expect(current.confidence).toBe(MAX_RULE_CONFIDENCE)
  })

  it('fades with contrary evidence and stops being applied', () => {
    let current = rule
    for (let i = 0; i < 3; i++) current = reinforce(current, false)
    expect(current.confidence).toBeLessThan(MIN_RULE_CONFIDENCE)
    expect(activeRules([current])).toEqual([])
  })

  it('treats the same finding again as confirmation, not a second belief', () => {
    const merged = mergeRule([rule], { ...rule, confidence: INITIAL_RULE_CONFIDENCE })
    expect(merged).toHaveLength(1)
    expect(merged[0].confidence).toBeGreaterThan(rule.confidence)
  })

  it('restarts confidence when the finding contradicts the stored one', () => {
    const merged = mergeRule([rule], {
      ruleKey: 'avoid_weekday',
      ruleValue: { weekday: 'fri' },
      confidence: INITIAL_RULE_CONFIDENCE,
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].ruleValue).toEqual({ weekday: 'fri' })
    expect(merged[0].confidence).toBe(INITIAL_RULE_CONFIDENCE)
  })
})
