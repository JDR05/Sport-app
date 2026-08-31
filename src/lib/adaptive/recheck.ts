// ADR-033, the half that was never built: a rule has to be able to fade.
//
// `reinforce`, `activeRules` and `mergeRule` existed, were tested, and had no
// callers anywhere in the product. So confidence only ever entered the model
// at 0.6 and stayed there. A rule learned in November went on shaping plans in
// March with exactly the same weight, and the sentence under it on the
// Playbook screen — "sie kann wieder sinken, wenn es später anders läuft" —
// was not true of anything the code did.
//
// This module asks the opposite question to detection. Detection looks for a
// pattern nobody knew about; this takes a belief the system already holds and
// asks whether the last weeks still support it.
//
// Two asymmetries are deliberate:
//
//   * Absence of evidence changes nothing. `null` is a real answer and by far
//     the most common one — a rule that removed its own evidence (nothing is
//     planned on an avoided weekday any more) neither hardens nor fades. That
//     is the sixth architecture principle applied to the model itself.
//   * A rule was earned by an experiment, so it takes evidence to overturn,
//     not merely a quiet fortnight. The margin below is what "evidence" means
//     here; three contradicting weeks are what it takes to fade one out.

import { MIN_RESOLVED_INSTANCES, RULE_RECHECK_MARGIN } from './constants'
import { completionRate, isResolved } from './detect'
import type { Observation } from './types'
import { weekdayOf } from '@/lib/engine/dates'
import type { PersonalRule } from '@/lib/domain/types'

export type RuleVerdict = {
  ruleKey: string
  /** null when the weeks say nothing either way — the usual case. */
  agrees: boolean | null
  /** Completion rate on the side the rule is about, and everywhere else. */
  onRule: number | null
  elsewhere: number | null
  /** Resolved actions behind those two rates. */
  resolved: number
}

/**
 * What each rule claims about the subset it names.
 *
 * `better` — actions in this subset get done more often ("evenings work for
 * you"). `worse` — they get done less often, which is why the plan avoids it
 * ("Wednesday does not work for you").
 */
type Claim = 'better' | 'worse'

/** Splits the observations into the subset a rule is about, and the rest. */
type Split = { on: Observation[]; rest: Observation[]; claim: Claim } | null

export function recheckRules(
  rules: PersonalRule[],
  observations: Observation[],
): RuleVerdict[] {
  return rules.map((rule) => verdictFor(rule, observations))
}

function verdictFor(rule: PersonalRule, observations: Observation[]): RuleVerdict {
  const empty: RuleVerdict = { ruleKey: rule.ruleKey, agrees: null, onRule: null, elsewhere: null, resolved: 0 }

  const split = splitFor(rule, observations)
  if (!split) return empty

  const on = split.on.filter(isResolved)
  const rest = split.rest.filter(isResolved)

  // Both sides need enough behind them. Four is the same bar detection uses,
  // and for the same reason: three lets a single week speak for the person.
  if (on.length < MIN_RESOLVED_INSTANCES || rest.length < MIN_RESOLVED_INSTANCES) return empty

  const onRule = completionRate(on)
  const elsewhere = completionRate(rest)
  if (onRule === null || elsewhere === null) return empty

  // Positive means the claim still points the right way.
  const gap = split.claim === 'better' ? onRule - elsewhere : elsewhere - onRule

  const agrees =
    gap >= RULE_RECHECK_MARGIN ? true : gap <= -RULE_RECHECK_MARGIN ? false : null

  return { ruleKey: rule.ruleKey, agrees, onRule, elsewhere, resolved: on.length + rest.length }
}

function splitFor(rule: PersonalRule, observations: Observation[]): Split {
  const v = rule.ruleValue

  switch (rule.ruleKey) {
    case 'avoid_weekday': {
      const day = v.weekday
      if (typeof day !== 'string') return null
      // The health baseline still lands on an avoided day, which is the only
      // reason this rule can be re-checked at all: the goal track left, so
      // without the baseline the day would carry no evidence for ever.
      return {
        on: observations.filter((o) => weekdayOf(o.scheduledOn) === day),
        rest: observations.filter((o) => weekdayOf(o.scheduledOn) !== day),
        claim: 'worse',
      }
    }

    case 'prefer_time_slot': {
      const slot = v.slot
      if (typeof slot !== 'string') return null
      // An action with no time of day says nothing about times of day.
      const timed = observations.filter((o) => o.timeSlot !== null)
      return {
        on: timed.filter((o) => o.timeSlot === slot),
        rest: timed.filter((o) => o.timeSlot !== slot),
        claim: 'better',
      }
    }

    case 'shorter_sessions': {
      const max = v.maxMinutes
      if (typeof max !== 'number') return null
      const timed = observations.filter((o) => o.plannedDurationMin !== null)
      return {
        on: timed.filter((o) => (o.plannedDurationMin ?? 0) <= max),
        rest: timed.filter((o) => (o.plannedDurationMin ?? 0) > max),
        claim: 'better',
      }
    }

    case 'lighter_domain': {
      const domain = v.domain
      if (typeof domain !== 'string') return null
      return {
        on: observations.filter((o) => o.domain === domain),
        rest: observations.filter((o) => o.domain !== domain),
        claim: 'worse',
      }
    }

    // A key this version does not understand is left alone rather than faded.
    // Fading it would be a verdict reached by not having read the rule.
    default:
      return null
  }
}

/**
 * The sentence for a rule that has just lost its last confidence.
 *
 * Deliberately not framed as a correction of the person. The rule was true
 * when it was learned; what changed is them.
 */
export function fadedStatement(ruleKey: string): string {
  const what = FADED_LABEL[ruleKey] ?? 'Eine gelernte Regel'
  return (
    `${what} stimmt nicht mehr mit dem überein, was zuletzt passiert ist. ` +
    `Die Regel wird nicht mehr angewendet — sie war richtig, als sie entstanden ist, ` +
    `und du hast dich seitdem verändert.`
  )
}

const FADED_LABEL: Record<string, string> = {
  avoid_weekday: 'Der Tag, den dein Plan gemieden hat,',
  prefer_time_slot: 'Die Tageszeit, die für dich am besten lief,',
  shorter_sessions: 'Die kürzere Einheitslänge',
  lighter_domain: 'Der Bereich, den dein Plan kleiner gehalten hat,',
}
