// The whole point of the product, in one file: does anything the system learns
// actually change what it plans next week?
//
// An adaptive engine whose findings the planner ignores is a habit tracker with
// extra vocabulary. These tests close that gap and then guard it.

import { describe, expect, it } from 'vitest'
import {
  analyze,
  applyDecision,
  derivePersonalRule,
  evaluateExperiment,
  domainOfMetricKey,
  refinePlan,
  start,
  trialRuleOf,
  type BehaviorMetric,
} from '@/lib/adaptive'
import { MIN_RULE_CONFIDENCE } from '@/lib/adaptive/constants'
import { generatePlan } from '@/lib/engine'
import { planSignature, signatureDistance } from '@/lib/engine/signature'
import { weekdayOf } from '@/lib/engine/dates'
import { readRules } from '@/lib/engine/rules'
import type { PersonalRule } from '@/lib/domain/types'
import { ALL_COMBINATIONS, GOALS, makeInput, PROFILES, TODAY } from './fixtures/profiles'
import { repeat, THIS_WEEK_START, weekOf, WEDNESDAY_PROBLEM } from './fixtures/observations'

// Aylin trains on Wednesday and has enough other free days that the day can
// actually be given up — the case where the rule has something to do.
const aylin = makeInput(PROFILES[4], GOALS[1])
const jonas = makeInput(PROFILES[3], GOALS[1])

describe('the full cycle', () => {
  it('goes from repeated misses to a plan that no longer uses that day', () => {
    // 1 — detection and proposal
    const analysis = analyze(aylin, WEDNESDAY_PROBLEM)
    const experiment = analysis.experiment
    expect(experiment).not.toBeNull()

    // 2 — the user accepts, the experiment runs, and the plan changes *now*
    const running = start(experiment!)

    // The step that was missing for a long time. An experiment that leaves the
    // plan alone for fourteen days measures a fortnight in which nothing was
    // different, so whatever it then concludes is noise — and that noise would
    // be written into the personal model as a rule.
    const trial = trialRuleOf(running)
    const planBefore = generatePlan(aylin)
    const planDuring = generatePlan({ ...aylin, personalRules: [trial] })
    expect(signatureDistance(planSignature(planBefore), planSignature(planDuring)))
      .toBeGreaterThan(0)

    // 3 — evaluation, on behaviour only
    const observed: BehaviorMetric = {
      metricKey: running.metricKey,
      metricClass: 'behavior',
      value: 0.9,
    }
    const evaluation = evaluateExperiment(running, observed, 8)
    expect(evaluation.decision).toBe('keep')
    expect(applyDecision(running, evaluation).status).toBe('adopted')

    // 4 — memory
    const rule = derivePersonalRule(running, evaluation)
    expect(rule).not.toBeNull()

    // 5 — and the next plan is genuinely different
    const before = generatePlan(aylin)
    const after = generatePlan({ ...aylin, personalRules: [rule!] })

    // The rule governs where sessions are *placed*. A daily routine that also
    // happens to fall on a Wednesday is untouched by it, which is why this
    // looks at the goal track rather than at every item on the day.
    const sessionsBefore = before.items.filter(
      (i) => i.track === 'goal' && weekdayOf(i.scheduledOn) === 'wed',
    )
    const sessionsAfter = after.items.filter(
      (i) => i.track === 'goal' && weekdayOf(i.scheduledOn) === 'wed',
    )

    expect(sessionsBefore.length).toBeGreaterThan(0)
    expect(sessionsAfter).toEqual([])
    expect(signatureDistance(planSignature(before), planSignature(after))).toBeGreaterThan(0)
  })

  it('tells the user why the plan changed', () => {
    // An adaptation the user cannot see did not happen as far as they are
    // concerned. Critique K1.
    const rule: PersonalRule = {
      ruleKey: 'avoid_weekday',
      ruleValue: { weekday: 'wed' },
      confidence: 0.6,
    }
    const plan = generatePlan({ ...aylin, personalRules: [rule] })
    const explanation = plan.rationale.find((r) =>
      r.basedOn.includes('personalRules.avoid_weekday'),
    )
    expect(explanation).toBeDefined()
    expect(explanation?.text).toContain('Mittwoch')
  })
})

describe('rules the planner applies', () => {
  it('ignores a rule whose confidence has faded', () => {
    // The person changed. A model that can only accumulate certainty
    // eventually describes who they used to be.
    const faded: PersonalRule = {
      ruleKey: 'avoid_weekday',
      ruleValue: { weekday: 'wed' },
      confidence: MIN_RULE_CONFIDENCE - 0.01,
    }
    expect(readRules([faded]).avoidWeekdays).toEqual([])

    const plan = generatePlan({ ...jonas, personalRules: [faded] })
    const untouched = generatePlan(jonas)
    expect(planSignature(plan)).toEqual(planSignature(untouched))
  })

  it('ignores a rule it does not understand instead of failing', () => {
    // A rule written by a newer version must not stop an older planner.
    const unknown: PersonalRule = { ruleKey: 'teleport_user', ruleValue: {}, confidence: 0.9 }
    expect(() => generatePlan({ ...jonas, personalRules: [unknown] })).not.toThrow()
  })

  it('refuses to empty the week', () => {
    // Sofie has two usable days. Dropping one of them on the strength of a
    // rule would leave a plan that cannot happen, so the rule is skipped.
    const sofie = makeInput(PROFILES[2], GOALS[1])
    const rules: PersonalRule[] = [
      { ruleKey: 'avoid_weekday', ruleValue: { weekday: 'wed' }, confidence: 0.9 },
      { ruleKey: 'avoid_weekday', ruleValue: { weekday: 'sat' }, confidence: 0.9 },
    ]
    const plan = generatePlan({ ...sofie, personalRules: rules })
    expect(plan.items.length).toBeGreaterThan(0)
  })

  it('shortens sessions but never lengthens them', () => {
    const rule: PersonalRule = {
      ruleKey: 'shorter_sessions',
      ruleValue: { maxMinutes: 30 },
      confidence: 0.7,
    }
    const before = generatePlan(jonas)
    const after = generatePlan({ ...jonas, personalRules: [rule] })

    const longestBefore = Math.max(...before.items.map((i) => i.plannedDurationMin ?? 0))
    const longestAfter = Math.max(...after.items.map((i) => i.plannedDurationMin ?? 0))

    expect(longestBefore).toBeGreaterThan(30)
    expect(longestAfter).toBeLessThanOrEqual(longestBefore)
  })

  it('moves actions to the time of day that works, when the day offers a choice', () => {
    // Deliberately a schedule with two slots on the same day. A rule that only
    // ever fires when there is nothing to choose between is not a rule.
    const twoSlotsADay = {
      ...jonas,
      schedule: {
        ...jonas.schedule,
        freeSlots: [
          { weekday: 'mon' as const, start: '07:00', minutes: 45 },
          { weekday: 'mon' as const, start: '18:00', minutes: 90 },
          { weekday: 'thu' as const, start: '07:00', minutes: 45 },
          { weekday: 'thu' as const, start: '18:00', minutes: 90 },
          { weekday: 'sun' as const, start: '07:00', minutes: 60 },
        ],
      },
    }
    const rule: PersonalRule = {
      ruleKey: 'prefer_time_slot',
      ruleValue: { slot: 'early' },
      confidence: 0.8,
    }

    const before = generatePlan(twoSlotsADay).items.filter((i) => i.track === 'goal')
    const after = generatePlan({ ...twoSlotsADay, personalRules: [rule] })
      .items.filter((i) => i.track === 'goal')

    expect(before.some((i) => i.timeSlot !== 'early')).toBe(true)
    expect(after.every((i) => i.timeSlot === 'early')).toBe(true)
  })

  it('makes an overwhelming area smaller without removing it', () => {
    const rule: PersonalRule = {
      ruleKey: 'lighter_domain',
      ruleValue: { domain: 'movement' },
      confidence: 0.8,
    }
    const gesuender = makeInput(PROFILES[0], GOALS[6]) // daily step target in the baseline
    const before = generatePlan(gesuender).items.filter((i) => i.domain === 'movement')
    const after = generatePlan({ ...gesuender, personalRules: [rule] })
      .items.filter((i) => i.domain === 'movement')

    expect(before.length).toBeGreaterThan(1)
    // Smaller, but still there: the area was too much, not wrong.
    expect(after.length).toBe(1)
  })

  it('never lets a learned rule produce an unsafe plan, for any profile or goal', () => {
    // The strongest guarantee in the adaptive layer: whatever the model has
    // learned, the invariants still hold. generatePlan throws if they do not.
    const everyRule: PersonalRule[] = [
      { ruleKey: 'avoid_weekday', ruleValue: { weekday: 'wed' }, confidence: 0.9 },
      { ruleKey: 'prefer_time_slot', ruleValue: { slot: 'early' }, confidence: 0.9 },
      { ruleKey: 'shorter_sessions', ruleValue: { maxMinutes: 20 }, confidence: 0.9 },
      { ruleKey: 'lighter_domain', ruleValue: { domain: 'nutrition' }, confidence: 0.9 },
    ]

    for (const { name, input } of ALL_COMBINATIONS) {
      for (const rule of everyRule) {
        expect(() => generatePlan({ ...input, personalRules: [rule] }), `${name} · ${rule.ruleKey}`)
          .not.toThrow()
      }
      expect(() => generatePlan({ ...input, personalRules: everyRule }), `${name} · alle`)
        .not.toThrow()
    }
  })
})

describe('plan care', () => {
  /** This week, the one plan care is allowed to touch. */
  const thisWeek = weekOf(THIS_WEEK_START, [
    { day: 'mon', status: 'missed' },
    { day: 'tue', status: 'done' },
  ])

  it('produces no personal rule — by having nowhere to put one', () => {
    // ADR-013 as a shape, not a convention: there is no field on PlanPatch a
    // careless caller could read a rule out of.
    const patch = refinePlan(thisWeek, TODAY)
    expect(Object.keys(patch).sort()).toEqual(['moves', 'notes', 'provisional', 'removals'])
    expect(patch.provisional).toBe(true)
  })

  it('acts in week one, where detection deliberately cannot', () => {
    const analysis = analyze(jonas, thisWeek)

    expect(analysis.deviations).toEqual([])
    expect(analysis.experiment).toBeNull()
    expect(analysis.patch.moves.length).toBeGreaterThan(0)
  })

  it('drops what the plan got wrong instead of counting it as a miss', () => {
    const wrong = weekOf(THIS_WEEK_START, [
      { day: 'mon', status: 'not_relevant', title: 'Meal Prep am Sonntag' },
      { day: 'tue', status: 'done' },
    ])
    const patch = refinePlan(wrong, TODAY)

    expect(patch.removals).toHaveLength(1)
    expect(patch.removals[0].reason).toContain('nicht als verpasst')
  })

  it('says out loud that it is provisional', () => {
    const patch = refinePlan(thisWeek, TODAY)
    expect(patch.notes.join(' ')).toMatch(/gespeichert|gelernt/)
    for (const move of patch.moves) expect(move.reason).toContain('Vorläufig')
  })

  it('never replans the past', () => {
    const patch = refinePlan(thisWeek, TODAY)
    for (const move of patch.moves) expect(move.toDate > TODAY).toBe(true)
  })
})

// Plan care is handed the same six-week window detection reads, and it used to
// work on all of it. Every `not_relevant` action ever marked came back as news
// every week for six weeks, an action already dropped offered for removal
// again. Every miss in six weeks became a move, and because the search always
// started from today they all landed on the same date: five corrections, one
// day, under a heading that said "an dieser Woche".
describe('the week plan care is allowed to touch', () => {
  it('leaves six weeks of history alone', () => {
    // WEDNESDAY_PROBLEM is four past weeks with a miss in each. It is evidence
    // for detection and none of the app's business as a correction.
    const patch = refinePlan(WEDNESDAY_PROBLEM, TODAY)
    expect(patch.moves).toEqual([])
    expect(patch.removals).toEqual([])
    expect(patch.notes).toEqual([])
  })

  it('does not re-offer a planning error from a past week', () => {
    const wrong = repeat([
      { day: 'mon', status: 'not_relevant', title: 'Meal Prep am Sonntag' },
      { day: 'tue', status: 'done' },
    ])
    expect(refinePlan(wrong, TODAY).removals).toEqual([])
  })

  it('still sees this week when the history is long', () => {
    const both = [
      ...WEDNESDAY_PROBLEM,
      ...weekOf(THIS_WEEK_START, [{ day: 'mon', status: 'missed' }]),
    ]
    const patch = refinePlan(both, TODAY)
    expect(patch.moves).toHaveLength(1)
    expect(patch.moves[0].fromDate).toBe(THIS_WEEK_START)
  })

  it('gives two misses two different days', () => {
    // One make-up is a courtesy. Two on the same evening is a backlog, and
    // that is exactly what a search always starting from today produced.
    const twoMisses = weekOf(THIS_WEEK_START, [
      { day: 'mon', status: 'missed' },
      { day: 'tue', status: 'missed' },
    ])
    const patch = refinePlan(twoMisses, TODAY)

    expect(patch.moves).toHaveLength(2)
    expect(new Set(patch.moves.map((m) => m.toDate)).size).toBe(2)
    for (const move of patch.moves) expect(move.toDate > TODAY).toBe(true)
  })

  it('names only the domains it actually corrected', () => {
    // The note listed every domain in the window, including weeks it had not
    // touched — a correction to one training session announced as covering
    // nutrition and movement too.
    const mixed = [
      ...weekOf(THIS_WEEK_START, [{ day: 'mon', status: 'missed', domain: 'training' }]),
      ...weekOf(THIS_WEEK_START, [{ day: 'tue', status: 'done', domain: 'nutrition' }]),
    ]
    const note = refinePlan(mixed, TODAY).notes.join(' ')

    expect(note).toContain('Training')
    expect(note).not.toContain('Ernährung')
  })
})

describe('a rule that is only being tested', () => {
  // Two rules of the same key can now coexist: one learned, one under test.
  // Which of them the planner follows must not depend on the order the
  // database happened to return the rows in.
  const learned: PersonalRule = {
    ruleKey: 'prefer_time_slot',
    ruleValue: { slot: 'evening' },
    confidence: 0.8,
  }
  const underTest: PersonalRule = {
    ruleKey: 'prefer_time_slot',
    ruleValue: { slot: 'early' },
    confidence: 0.5,
    trial: true,
  }

  it('wins over an established rule of the same key', () => {
    expect(readRules([learned, underTest]).preferredSlot).toBe('early')
  })

  it('wins whichever order the rows arrive in', () => {
    // Otherwise an experiment would change the plan or not depending on row
    // order — the same experiment producing two different answers.
    expect(readRules([underTest, learned]).preferredSlot).toBe('early')
  })

  it('is carried by trialRuleOf, so the planner can tell it apart', () => {
    const analysis = analyze(aylin, WEDNESDAY_PROBLEM)
    expect(trialRuleOf(analysis.experiment!).trial).toBe(true)
  })
})

describe('the metric key', () => {
  it('round-trips the domain the baseline was measured on', () => {
    // The baseline is computed over one domain. If the observation is later
    // taken over the whole week, the difference between them is not an effect
    // — it is the other domains — and a wrong rule enters the model for good.
    const analysis = analyze(aylin, WEDNESDAY_PROBLEM)
    const key = analysis.experiment!.metricKey
    const domain = domainOfMetricKey(key)
    if (key.includes('.')) {
      expect(domain).not.toBeNull()
      expect(key).toBe(`completion_rate.${domain}`)
    } else {
      expect(domain).toBeNull()
    }
  })

  it('reads a plain completion_rate as covering every domain', () => {
    expect(domainOfMetricKey('completion_rate')).toBeNull()
    expect(domainOfMetricKey('completion_rate.nutrition')).toBe('nutrition')
  })
})
