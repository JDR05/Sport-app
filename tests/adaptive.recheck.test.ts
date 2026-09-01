// ADR-033 said a rule has to be able to weaken. Nothing did.
//
// `reinforce`, `activeRules` and `mergeRule` were written in Schritt 6, were
// tested, and had no callers anywhere in the product. Confidence entered the
// model at 0.6 and stayed there for ever — so a rule learned in November went
// on shaping plans in March with exactly the same weight, and the sentence
// under it on the Playbook screen ("sie kann wieder sinken, wenn es später
// anders läuft") was not true of anything the code did.

import { describe, expect, it } from 'vitest'
import { recheckRules, reinforce, type RuleVerdict } from '@/lib/adaptive'
import {
  CONFIDENCE_STEP, INITIAL_RULE_CONFIDENCE, MIN_RESOLVED_INSTANCES, MIN_RULE_CONFIDENCE,
} from '@/lib/adaptive/constants'
import type { Observation } from '@/lib/adaptive'
import type { PersonalRule } from '@/lib/domain/types'
import { addDays } from '@/lib/engine/dates'

const MONDAY = '2026-08-03'

/** `count` actions on one weekday offset, all with the same status. */
function on(
  dayOffset: number,
  count: number,
  status: Observation['status'],
  extra: Partial<Observation> = {},
): Observation[] {
  return Array.from({ length: count }, (_, i) => ({
    itemId: `${dayOffset}-${i}-${status}-${extra.timeSlot ?? ''}-${extra.plannedDurationMin ?? ''}`,
    scheduledOn: addDays(MONDAY, dayOffset + i * 7),
    domain: 'training' as const,
    // Baseline, because that is what is actually left to observe once an
    // avoid_weekday rule has taken effect: the goal track has left the day.
    // These fixtures said `goal`, which described the world before the rule —
    // the one situation in which the re-check is never run.
    track: 'baseline' as const,
    title: 'Training',
    timeSlot: 'evening' as const,
    plannedDurationMin: 45,
    status,
    ...extra,
  }))
}

const wednesdayRule: PersonalRule = {
  ruleKey: 'avoid_weekday',
  ruleValue: { weekday: 'wed' },
  confidence: INITIAL_RULE_CONFIDENCE,
}

function only(rule: PersonalRule, observations: Observation[]): RuleVerdict {
  return recheckRules([rule], observations)[0]
}

describe('a rule the weeks still agree with', () => {
  it('is confirmed when the avoided day is still the worse one', () => {
    const verdict = only(wednesdayRule, [
      ...on(2, 5, 'missed'), // Wednesdays: still missed
      ...on(0, 5, 'done'), // Mondays: still fine
    ])
    expect(verdict.agrees).toBe(true)
  })

  it('gains confidence, up to a ceiling below certainty', () => {
    let rule = wednesdayRule
    for (let i = 0; i < 20; i++) rule = reinforce(rule, true)
    expect(rule.confidence).toBeLessThan(1)
  })
})

describe('a rule the weeks contradict', () => {
  const contradicting = [...on(2, 5, 'done'), ...on(0, 5, 'missed')]

  it('is contradicted when the avoided day is now the better one', () => {
    expect(only(wednesdayRule, contradicting).agrees).toBe(false)
  })

  it('fades below the applied threshold after three of them', () => {
    // Three weeks, not one. A rule was earned by an experiment and does not
    // fall over because of a single odd fortnight.
    let rule = wednesdayRule
    const steps: number[] = []
    for (let i = 0; i < 3; i++) {
      rule = reinforce(rule, false)
      steps.push(rule.confidence)
    }
    expect(steps[0]).toBeGreaterThanOrEqual(MIN_RULE_CONFIDENCE)
    expect(steps[1]).toBeGreaterThanOrEqual(MIN_RULE_CONFIDENCE)
    expect(steps[2]).toBeLessThan(MIN_RULE_CONFIDENCE)
    expect(steps[0] - INITIAL_RULE_CONFIDENCE).toBeCloseTo(-CONFIDENCE_STEP)
  })
})

describe('silence is a real answer', () => {
  it('says nothing when the difference is inside the margin', () => {
    const level = [...on(2, 5, 'done'), ...on(0, 5, 'done')]
    expect(only(wednesdayRule, level).agrees).toBeNull()
  })

  it('says nothing when one side is too thin', () => {
    const thin = [...on(2, MIN_RESOLVED_INSTANCES - 1, 'missed'), ...on(0, 8, 'done')]
    expect(only(wednesdayRule, thin).agrees).toBeNull()
  })

  it('says nothing at all when the rule erased its own evidence', () => {
    // The usual case for avoid_weekday: the goal track left the day, so unless
    // the health baseline still lands there, nothing is planned to observe.
    // A belief must not fade for want of data — that is principle six applied
    // to the model itself.
    expect(only(wednesdayRule, on(0, 10, 'done')).agrees).toBeNull()
  })

  it('never counts an unrated action either way', () => {
    const untouched = [...on(2, 10, 'unknown'), ...on(0, 10, 'done')]
    expect(only(wednesdayRule, untouched).agrees).toBeNull()
  })

  it('leaves a rule this version cannot read alone', () => {
    // Fading it would be a verdict reached by not having understood the rule.
    const unknown: PersonalRule = { ruleKey: 'from_a_newer_version', ruleValue: {}, confidence: 0.6 }
    expect(only(unknown, [...on(2, 8, 'missed'), ...on(0, 8, 'done')]).agrees).toBeNull()
  })

  it('leaves a rule whose value is the wrong shape alone', () => {
    const broken: PersonalRule = { ruleKey: 'avoid_weekday', ruleValue: {}, confidence: 0.6 }
    expect(only(broken, [...on(2, 8, 'missed'), ...on(0, 8, 'done')]).agrees).toBeNull()
  })
})

describe('the other three rule kinds', () => {
  it('reads prefer_time_slot off the slot that was chosen', () => {
    const rule: PersonalRule = {
      ruleKey: 'prefer_time_slot',
      ruleValue: { slot: 'early' },
      confidence: 0.6,
    }
    const mornings = [
      ...on(0, 5, 'done', { timeSlot: 'early' }),
      ...on(1, 5, 'missed', { timeSlot: 'evening' }),
    ]
    expect(only(rule, mornings).agrees).toBe(true)

    const reversed = [
      ...on(0, 5, 'missed', { timeSlot: 'early' }),
      ...on(1, 5, 'done', { timeSlot: 'evening' }),
    ]
    expect(only(rule, reversed).agrees).toBe(false)
  })

  it('ignores actions with no time of day', () => {
    // A standing rule with no hour on it says nothing about hours.
    const rule: PersonalRule = {
      ruleKey: 'prefer_time_slot',
      ruleValue: { slot: 'early' },
      confidence: 0.6,
    }
    const untimed = [
      ...on(0, 8, 'done', { timeSlot: null }),
      ...on(1, 8, 'missed', { timeSlot: null }),
    ]
    expect(only(rule, untimed).agrees).toBeNull()
  })

  it('reads shorter_sessions off the length that was planned', () => {
    const rule: PersonalRule = {
      ruleKey: 'shorter_sessions',
      ruleValue: { maxMinutes: 30 },
      confidence: 0.6,
    }
    const short = [
      ...on(0, 5, 'done', { plannedDurationMin: 25 }),
      ...on(1, 5, 'missed', { plannedDurationMin: 60 }),
    ]
    expect(only(rule, short).agrees).toBe(true)
  })

  it('reads lighter_domain as a claim that the domain went worse', () => {
    const rule: PersonalRule = {
      ruleKey: 'lighter_domain',
      ruleValue: { domain: 'nutrition' },
      confidence: 0.6,
    }
    const stillHard = [
      ...on(0, 5, 'missed', { domain: 'nutrition' }),
      ...on(1, 5, 'done', { domain: 'training' }),
    ]
    expect(only(rule, stillHard).agrees).toBe(true)

    const nowFine = [
      ...on(0, 5, 'done', { domain: 'nutrition' }),
      ...on(1, 5, 'missed', { domain: 'training' }),
    ]
    expect(only(rule, nowFine).agrees).toBe(false)
  })
})

describe('what a verdict carries', () => {
  it('brings both rates and the count they came from', () => {
    const verdict = only(wednesdayRule, [...on(2, 5, 'missed'), ...on(0, 5, 'done')])
    expect(verdict.onRule).toBe(0)
    expect(verdict.elsewhere).toBe(1)
    expect(verdict.resolved).toBe(10)
    expect(verdict.ruleKey).toBe('avoid_weekday')
  })

  it('answers one verdict per rule, in order', () => {
    const rules: PersonalRule[] = [
      wednesdayRule,
      { ruleKey: 'lighter_domain', ruleValue: { domain: 'sleep' }, confidence: 0.6 },
    ]
    const verdicts = recheckRules(rules, on(0, 4, 'done'))
    expect(verdicts.map((v) => v.ruleKey)).toEqual(['avoid_weekday', 'lighter_domain'])
  })
})

describe('a rule must not be judged on the population it created', () => {
  // The loop this closes: applyDayRules removes goal-track sessions from an
  // avoided day but leaves the daily baseline routines. Comparing everything
  // then compares easy-day against hard-day rather than day against day, so
  // the avoided day looks better by construction and a correct rule reads as
  // contradicted.
  //
  // Measured before the fix: identical behaviour over six weeks, only the
  // weekday of the session moved, verdict flipped from agrees to disagrees,
  // confidence fell 0.6 → 0.45 → 0.3 → 0.15, the planner stopped avoiding the
  // day, the sessions went back, they were missed again, and detection
  // re-proposed the same experiment.

  /** A week where the baseline is kept everywhere and sessions are missed. */
  const week = (offset: number): Observation[] => [
    ...on(offset + 2, 1, 'done', { track: 'baseline', domain: 'movement' }),
    ...on(offset + 0, 1, 'done', { track: 'baseline', domain: 'movement' }),
    ...on(offset + 1, 1, 'done', { track: 'baseline', domain: 'movement' }),
    ...on(offset + 3, 1, 'done', { track: 'baseline', domain: 'movement' }),
    // The session, which now sits on Thursday because the rule moved it, and
    // which this person misses wherever it is.
    ...on(offset + 3, 1, 'missed', { track: 'goal' }),
  ]

  it('does not contradict itself because the sessions moved away', () => {
    const observations = [0, 7, 14, 21].flatMap(week)
    // The baseline is kept on every day including the avoided one, so there is
    // no evidence the day got easier — and no verdict either way. Silence is
    // the honest answer, not a fade.
    expect(only(wednesdayRule, observations).agrees).not.toBe(false)
  })

  it('still fades when the baseline itself says the day is fine now', () => {
    // The counterweight: the rule must remain unlearnable-from-nothing but
    // still fadeable from real evidence. Here the avoided day is genuinely
    // the best day, measured on the same kind of action as every other day.
    const observations = [
      ...on(2, MIN_RESOLVED_INSTANCES, 'done', { track: 'baseline' }),
      ...on(0, MIN_RESOLVED_INSTANCES, 'missed', { track: 'baseline' }),
    ]
    expect(only(wednesdayRule, observations).agrees).toBe(false)
  })
})
