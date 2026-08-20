// Reading the personal model back into the plan.
//
// This is the half of the loop that makes the learning worth anything: without
// it, the adaptive engine produces insights the planner ignores. Rules arrive
// as loose key/value pairs because that is how they are stored; they are
// narrowed here, once, so the rest of the engine works with typed values.
//
// Two limits hold for every rule, and both are deliberate:
//
//   1. A rule may only ever make the plan *smaller* or move it — never larger,
//      never longer, never more often. A learned rule can therefore not walk
//      the plan through a safety limit, whatever it says.
//   2. A rule below MIN_RULE_CONFIDENCE stops being applied. People change,
//      and a rule that keeps being contradicted has to fade out rather than
//      calcify into a permanent belief about someone.

import type {
  PersonalRule,
  PlanDomain,
  Rationale,
  TimeSlot,
  Weekday,
} from '@/lib/domain/types'
import { MIN_VIABLE_SESSION_MINUTES } from './constants'

/** Mirrors adaptive/constants MIN_RULE_CONFIDENCE; duplicated so the engine
 *  stays free of any import from the adaptive layer. */
const MIN_APPLIED_CONFIDENCE = 0.3

/**
 * Days that must stay available whatever the rules say. A rule that would
 * leave the week with nothing to schedule is a rule that broke the plan, so it
 * is skipped and the fact is recorded rather than silently swallowed.
 */
const MIN_REMAINING_DAYS = 2

export type ActiveRules = {
  avoidWeekdays: Weekday[]
  preferredSlot: TimeSlot | null
  maxSessionMinutes: number | null
  lightDomains: PlanDomain[]
  /** Keys actually applied, for the rationale shown to the user. */
  appliedKeys: string[]
}

export const EMPTY_RULES: ActiveRules = {
  avoidWeekdays: [],
  preferredSlot: null,
  maxSessionMinutes: null,
  lightDomains: [],
  appliedKeys: [],
}

const WEEKDAY_SET = new Set<string>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
const SLOT_SET = new Set<string>(['early', 'midday', 'evening'])
const DOMAIN_SET = new Set<string>([
  'training', 'nutrition', 'movement', 'sleep', 'self_improvement', 'priority',
])

/**
 * Narrows stored rules to the ones this engine version understands. An unknown
 * key is ignored rather than rejected: a rule written by a newer version must
 * not stop an older planner from producing a plan.
 */
export function readRules(rules: PersonalRule[]): ActiveRules {
  const out: ActiveRules = { ...EMPTY_RULES, avoidWeekdays: [], lightDomains: [], appliedKeys: [] }

  // Established rules first, the rule under test second, so that a trial wins
  // where two rules of the same key disagree. Without a fixed order this would
  // depend on the row order the database happened to return, and an experiment
  // testing a different time slot than the one already learned would sometimes
  // change nothing at all. Additive keys are unaffected — for those a trial is
  // simply one more entry.
  const ordered = [...rules.filter((r) => !r.trial), ...rules.filter((r) => r.trial)]

  for (const rule of ordered) {
    if (rule.confidence < MIN_APPLIED_CONFIDENCE) continue
    const v = rule.ruleValue

    switch (rule.ruleKey) {
      case 'avoid_weekday': {
        const day = v.weekday
        if (typeof day === 'string' && WEEKDAY_SET.has(day)) {
          out.avoidWeekdays.push(day as Weekday)
          out.appliedKeys.push(rule.ruleKey)
        }
        break
      }
      case 'prefer_time_slot': {
        const slot = v.slot
        if (typeof slot === 'string' && SLOT_SET.has(slot)) {
          out.preferredSlot = slot as TimeSlot
          out.appliedKeys.push(rule.ruleKey)
        }
        break
      }
      case 'shorter_sessions': {
        const minutes = v.maxMinutes
        // Never below the point where a session stops being worth doing, and
        // never used to lengthen one.
        if (typeof minutes === 'number' && minutes >= MIN_VIABLE_SESSION_MINUTES) {
          out.maxSessionMinutes =
            out.maxSessionMinutes === null ? minutes : Math.min(out.maxSessionMinutes, minutes)
          out.appliedKeys.push(rule.ruleKey)
        }
        break
      }
      case 'lighter_domain': {
        const domain = v.domain
        if (typeof domain === 'string' && DOMAIN_SET.has(domain)) {
          out.lightDomains.push(domain as PlanDomain)
          out.appliedKeys.push(rule.ruleKey)
        }
        break
      }
      default:
        break
    }
  }

  return out
}

/**
 * Removes the days the person has repeatedly not managed — unless doing so
 * would leave too little week to plan in.
 *
 * The scope is deliberately narrow: this governs where *sessions are placed*,
 * not what happens on the day. A daily wind-down routine that also falls on a
 * Wednesday is untouched, because the pattern was about sessions, not about
 * the date. A rule that quietly deleted everything on a weekday would be
 * claiming far more than the evidence supports.
 *
 * Returns the days plus, when a rule was applied, the sentence explaining it:
 * an invisible adaptation is one the user has no reason to believe in.
 */
export function applyDayRules(
  available: Weekday[],
  rules: ActiveRules,
): { days: Weekday[]; rationale: Rationale[] } {
  if (rules.avoidWeekdays.length === 0) return { days: available, rationale: [] }

  const kept = available.filter((d) => !rules.avoidWeekdays.includes(d))
  if (kept.length < Math.min(MIN_REMAINING_DAYS, available.length)) {
    return { days: available, rationale: [] }
  }

  const removed = available.filter((d) => rules.avoidWeekdays.includes(d))
  if (removed.length === 0) return { days: available, rationale: [] }

  return {
    days: kept,
    rationale: [
      {
        text:
          `${removed.map((d) => WEEKDAY_LABEL[d]).join(' und ')} ist bei dir in einem ` +
          `abgeschlossenen Experiment als unzuverlässiger Tag herausgekommen. Dieser Plan ` +
          `nutzt ihn deshalb nicht.`,
        basedOn: ['personalRules.avoid_weekday'],
      },
    ],
  }
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}
