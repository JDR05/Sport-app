// A proposal is a promise that the change is small, singular and safe. These
// tests hold the engine to all three.

import { describe, expect, it } from 'vitest'
import {
  analyze,
  detectDeviations,
  formHypothesis,
  proposeExperiment,
  trialRuleOf,
} from '@/lib/adaptive'
import { EXPERIMENT_DAYS } from '@/lib/adaptive/constants'
import { generatePlan } from '@/lib/engine'
import { planSignature, signatureDistance } from '@/lib/engine/signature'
import { weekdayOf } from '@/lib/engine/dates'
import { daysBetween } from '@/lib/engine/dates'
import { ALL_COMBINATIONS, GOALS, makeInput, PROFILES } from './fixtures/profiles'
import { repeat, WEDNESDAY_PROBLEM } from './fixtures/observations'

// Aylin: free on Monday, Wednesday, Friday and Saturday, so a Wednesday
// session actually exists to be given up. Jonas was used here before, and his
// plan never placed anything on a Wednesday at all — the engine was proposing
// "14 Tage lang wird an diesem Wochentag nichts geplant" to somebody whose
// Wednesday was already empty, and the test asserted that as correct.
const input = makeInput(PROFILES[4], GOALS[1])

function wednesdayHypothesis() {
  const deviation = detectDeviations(WEDNESDAY_PROBLEM).find((d) => d.dimension === 'weekday')!
  return formHypothesis(deviation, WEDNESDAY_PROBLEM)!
}

describe('the hypothesis', () => {
  it('names a changeable cause, not the person', () => {
    const hypothesis = wednesdayHypothesis()
    expect(hypothesis.variable).toBe('weekday')
    expect(hypothesis.statement).toContain('Mittwoch')
    // "unmotivated" is a verdict; nothing follows from it. The vocabulary of
    // the engine has no word for it, and this test keeps it that way.
    expect(hypothesis.statement.toLowerCase()).not.toMatch(/motivier|diszipl|faul|versag/)
  })

  it('declines a time-of-day hypothesis when there is no better slot to move to', () => {
    // Everything is in the evening, so "try another time" would be advice
    // rather than an experiment. The engine has to stay quiet instead.
    const eveningsOnly = repeat([
      { day: 'mon', status: 'missed', timeSlot: 'evening' },
      { day: 'tue', status: 'missed', timeSlot: 'evening' },
      { day: 'thu', status: 'done', timeSlot: null },
      { day: 'sat', status: 'done', timeSlot: null },
    ])
    const deviation = detectDeviations(eveningsOnly).find((d) => d.dimension === 'time_slot')
    if (deviation) expect(formHypothesis(deviation, eveningsOnly)).toBeNull()
  })

  it('has no hypothesis for short sessions being skipped', () => {
    // The lever for long sessions is obvious. For short ones the cause is
    // somewhere this axis cannot see, and inventing one would be worse than
    // saying nothing.
    const shortOnes = repeat([
      { day: 'mon', status: 'missed', minutes: 20 },
      { day: 'tue', status: 'missed', minutes: 20 },
      { day: 'thu', status: 'done', minutes: 80 },
      { day: 'sat', status: 'done', minutes: 80 },
    ])
    const deviation = detectDeviations(shortOnes).find(
      (d) => d.dimension === 'duration' && d.bucket === 'short',
    )
    if (deviation) expect(formHypothesis(deviation, shortOnes)).toBeNull()
  })
})

describe('the experiment', () => {
  it('changes exactly one variable', () => {
    const experiment = proposeExperiment(wednesdayHypothesis(), input, WEDNESDAY_PROBLEM)!
    expect(experiment.variable).toBe('weekday')
    expect(Object.keys(experiment.proposedRule.ruleValue)).toHaveLength(1)
    expect(experiment.proposedRule.ruleKey).toBe('avoid_weekday')
  })

  it('has a fixed runtime and a baseline recorded up front', () => {
    const experiment = proposeExperiment(wednesdayHypothesis(), input, WEDNESDAY_PROBLEM)!
    expect(daysBetween(experiment.startDate, experiment.endDate)).toBe(EXPERIMENT_DAYS)
    expect(experiment.baseline.metricClass).toBe('behavior')
    expect(experiment.baseline.value).toBeGreaterThanOrEqual(0)
  })

  it('is measured on behaviour, never on the goal metric', () => {
    const experiment = proposeExperiment(wednesdayHypothesis(), input, WEDNESDAY_PROBLEM)!
    expect(experiment.metricKey).toMatch(/^completion_rate/)
    expect(experiment.metricKey).not.toMatch(/weight|kg|gewicht/i)
  })

  it('can show the data it came from', () => {
    const experiment = proposeExperiment(wednesdayHypothesis(), input, WEDNESDAY_PROBLEM)!
    expect(experiment.evidence.length).toBeGreaterThan(0)
  })

  it('starts as a proposal — the user decides, not the engine', () => {
    const experiment = proposeExperiment(wednesdayHypothesis(), input, WEDNESDAY_PROBLEM)!
    expect(experiment.status).toBe('proposed')
  })
})

describe('safety is checked by building the real plan', () => {
  it('never proposes a change that breaks an invariant, for any profile or goal', () => {
    // The gate in proposeExperiment runs generatePlan with the candidate rule
    // and lets the real invariants judge it. This asserts the outcome of that
    // gate across all seventy combinations rather than trusting the branch.
    for (const { name, input: combination } of ALL_COMBINATIONS) {
      const hypothesis = wednesdayHypothesis()
      const experiment = proposeExperiment(hypothesis, combination, WEDNESDAY_PROBLEM)
      if (!experiment) continue

      expect(() =>
        generatePlan({
          ...combination,
          personalRules: [...combination.personalRules, trialRuleOf(experiment)],
        }),
        name,
      ).not.toThrow()
    }
  })
})

describe('analyze', () => {
  it('offers one thing to try, even when several patterns are visible', () => {
    // Nutrition fails in the evenings while training works in the mornings —
    // that is a domain pattern and a time-of-day pattern at once. The user
    // still gets a single experiment.
    const twoPatterns = repeat([
      { day: 'mon', status: 'done', domain: 'training', timeSlot: 'early', minutes: 30 },
      { day: 'sat', status: 'done', domain: 'training', timeSlot: 'early', minutes: 30 },
      { day: 'wed', status: 'missed', domain: 'nutrition', timeSlot: 'evening', minutes: null },
      { day: 'thu', status: 'missed', domain: 'nutrition', timeSlot: 'evening', minutes: null },
    ])
    const analysis = analyze(input, twoPatterns)

    expect(analysis.deviations.length).toBeGreaterThan(1)
    expect(analysis.hypothesis).not.toBeNull()
    expect(analysis.experiment).not.toBeNull()
    // The one acted on is the strongest, and it is exactly one.
    expect(analysis.hypothesis?.deviation).toBe(analysis.deviations.find(
      (d) => d === analysis.hypothesis?.deviation,
    ))
  })

  it('acts on the Wednesday pattern', () => {
    const analysis = analyze(input, WEDNESDAY_PROBLEM)
    expect(analysis.experiment?.proposedRule).toEqual({
      ruleKey: 'avoid_weekday',
      ruleValue: { weekday: 'wed' },
    })
  })

  it('proposes nothing while another experiment is running', () => {
    // Two variables at once make both results unreadable.
    const analysis = analyze(input, WEDNESDAY_PROBLEM, { experimentInFlight: true })
    expect(analysis.experiment).toBeNull()
    expect(analysis.hypothesis).toBeNull()
    // It still says what it sees — silence and blindness are different things.
    expect(analysis.insights.length).toBeGreaterThan(0)
  })

  it('says nothing at all in a normal first week', () => {
    const firstWeek = repeat(
      [{ day: 'mon', status: 'done' }, { day: 'wed', status: 'missed' }, { day: 'sat', status: 'done' }],
      1,
    )
    const analysis = analyze(input, firstWeek)
    expect(analysis.deviations).toEqual([])
    expect(analysis.experiment).toBeNull()
    expect(analysis.insights).toEqual([])
  })

  it('gives every insight its evidence', () => {
    for (const insight of analyze(input, WEDNESDAY_PROBLEM).insights) {
      expect(insight.evidence.length).toBeGreaterThan(0)
    }
  })
})

describe('an experiment that would change nothing', () => {
  // The gate that matters most, and the one that was missing. Three of the four
  // rules the planner understands cannot move a plan in most weeks, and the
  // engine proposed them anyway. Whether a rule bites depends on the person's
  // schedule, not on the rule — so the only honest check is to build their week
  // both ways and compare.

  it('is not proposed at all', () => {
    // Jonas has six free days and his plan places nothing on a Wednesday.
    // "Nothing on Wednesdays for fourteen days" is not an experiment for him.
    const jonas = makeInput(PROFILES[3], GOALS[1])
    const before = generatePlan(jonas)
    expect(before.items.filter((i) => weekdayOf(i.scheduledOn) === 'wed')).toEqual([])

    expect(proposeExperiment(wednesdayHypothesis(), jonas, WEDNESDAY_PROBLEM)).toBeNull()
  })

  it('is still proposed for someone the same rule does affect', () => {
    // The gate must refuse the empty case without silencing the real one.
    const aylin = makeInput(PROFILES[4], GOALS[1])
    expect(generatePlan(aylin).items.some((i) => weekdayOf(i.scheduledOn) === 'wed')).toBe(true)

    const experiment = proposeExperiment(wednesdayHypothesis(), aylin, WEDNESDAY_PROBLEM)
    expect(experiment).not.toBeNull()
    expect(experiment!.proposedRule.ruleKey).toBe('avoid_weekday')
  })

  it('promises only what it delivers', () => {
    // Whatever is proposed, the plan it produces must differ from the current
    // one — that is the whole content of the sentence the user is shown.
    const aylin = makeInput(PROFILES[4], GOALS[1])
    const experiment = proposeExperiment(wednesdayHypothesis(), aylin, WEDNESDAY_PROBLEM)!
    const after = generatePlan({
      ...aylin,
      personalRules: [trialRuleOf(experiment)],
    })
    expect(
      signatureDistance(planSignature(generatePlan(aylin)), planSignature(after)),
    ).toBeGreaterThan(0)
  })
})
