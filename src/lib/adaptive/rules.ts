// Schritt 7: what the system is allowed to remember.
//
// A personal rule is the only artefact of this whole pipeline that outlives a
// single week, so the gate in front of it is deliberately narrow: a confirmed
// experiment, and nothing else. Plan care never writes here (ADR-013), a
// hypothesis never writes here, and a declined proposal never writes here.
//
// Rules also have to be able to weaken. A person in March is not the person
// from November, and a model that can only accumulate certainty eventually
// tells someone who they used to be.

import {
  CONFIDENCE_STEP,
  INITIAL_RULE_CONFIDENCE,
  MAX_RULE_CONFIDENCE,
  MIN_RULE_CONFIDENCE,
} from './constants'
import type { Evaluation, Experiment } from './types'
import type { PersonalRule } from '@/lib/domain/types'

/**
 * Returns a rule only for a `keep` decision on an experiment that actually ran.
 * Everything else returns null, which is the normal case.
 */
export function derivePersonalRule(
  experiment: Experiment,
  evaluation: Evaluation,
): PersonalRule | null {
  if (evaluation.decision !== 'keep') return null
  if (experiment.status === 'proposed' || experiment.status === 'rejected') return null

  return {
    ruleKey: experiment.proposedRule.ruleKey,
    ruleValue: experiment.proposedRule.ruleValue,
    confidence: INITIAL_RULE_CONFIDENCE,
  }
}

/**
 * Later evidence moves an existing rule rather than replacing it. Agreement
 * raises confidence towards a ceiling that is deliberately below 1 — no amount
 * of repetition makes a statement about a person certain. Disagreement lowers
 * it, and once it falls under the threshold the planner stops applying it.
 */
export function reinforce(rule: PersonalRule, agrees: boolean): PersonalRule {
  const next = agrees
    ? Math.min(MAX_RULE_CONFIDENCE, rule.confidence + CONFIDENCE_STEP)
    : Math.max(0, rule.confidence - CONFIDENCE_STEP)
  return { ...rule, confidence: round2(next) }
}

/** Rules the planner should still apply. Faded ones are kept, just not used. */
export function activeRules(rules: PersonalRule[]): PersonalRule[] {
  return rules.filter((r) => r.confidence >= MIN_RULE_CONFIDENCE)
}

/**
 * Merges a newly derived rule into the model. The same key arriving again is
 * confirmation of what is already known, not a second, competing belief.
 */
export function mergeRule(existing: PersonalRule[], incoming: PersonalRule): PersonalRule[] {
  const match = existing.find((r) => r.ruleKey === incoming.ruleKey)
  if (!match) return [...existing, incoming]

  const same = JSON.stringify(match.ruleValue) === JSON.stringify(incoming.ruleValue)
  const updated = same
    ? reinforce(match, true)
    : { ...incoming, confidence: INITIAL_RULE_CONFIDENCE }

  return existing.map((r) => (r.ruleKey === incoming.ruleKey ? updated : r))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
