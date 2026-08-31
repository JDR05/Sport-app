// What the AI layer is actually for: catching output that is well-formed but
// not allowed. A schema-valid proposal can still tell someone to skip meals.
//
// These used to be aimed at checkSuggestions, which is gone (ADR-072). The
// rule families are the same ones; they are pointed at checkProposal now, so
// they cover the path model-written text actually reaches a person through.

import { describe, expect, it } from 'vitest'
import { checkClassification, checkProposal } from '@/lib/ai'
import { goalClassificationSchema, planProposalSchema } from '@/lib/ai/schemas'

type Action = { title: string; reasoning: string; minutes: number; timesPerWeek: number }

function withAction(over: Partial<Action>) {
  return {
    headline: 'Eine ruhige Woche',
    reasoning: 'Du hast angegeben, überwiegend sitzend zu arbeiten, und abends Zeit zu haben.',
    actions: [
      {
        title: 'Abends kurz spazieren',
        reasoning: 'Du hast angegeben, überwiegend sitzend zu arbeiten, und abends Zeit zu haben.',
        minutes: 15,
        timesPerWeek: 3,
        ...over,
      },
    ],
  }
}

const rules = (over: Partial<Action>) => checkProposal(withAction(over)).map((v) => v.rule)

describe('checkProposal', () => {
  it('accepts an additive, person-specific action', () => {
    expect(checkProposal(withAction({}))).toEqual([])
  })

  it.each([
    ['verzichte auf Zucker', 'additive_only'],
    ['Streiche das Abendessen', 'additive_only'],
    ['Keine Kohlenhydrate mehr am Abend', 'additive_only'],
    ['Probier mal Fasten aus', 'additive_only'],
  ])('rejects restriction framing: %s', (title, rule) => {
    expect(rules({ title })).toContain(rule)
  })

  it('rejects calorie and macro numbers, which the app computes itself', () => {
    expect(rules({ title: 'Bleib bei 1400 kcal am Tag' })).toContain('no_numeric_health_claims')
    expect(rules({ title: 'Iss 120 g Protein' })).toContain('no_numeric_health_claims')
  })

  it('rejects any suggestion to sleep less, under any goal', () => {
    expect(
      rules({ reasoning: 'Steh früher auf um zu trainieren, dafür etwas weniger Schlaf.' }),
    ).toContain('never_less_sleep')
  })

  it('rejects medical and supplement claims', () => {
    expect(rules({ title: 'Nimm ein Magnesium-Supplement' })).toContain('no_medical_claims')
    expect(rules({ reasoning: 'Das heilt deine Schlafstörung zuverlässig.' }))
      .toContain('no_medical_claims')
  })

  it('rejects effort nobody will fit into a day', () => {
    expect(rules({ minutes: 60 })).toContain('realistic_effort')
  })

  it('rejects something demanded almost every day', () => {
    // The first thing dropped, and its failure then reads as a behavioural
    // pattern that is really a planning one.
    expect(rules({ timesPerWeek: 7 })).toContain('too_frequent')
  })

  it('scans the headline and the overall reasoning too, not only the actions', () => {
    const proposal = { ...withAction({}), headline: 'Diese Woche verzichtest du auf Zucker' }
    expect(checkProposal(proposal).map((v) => v.rule)).toContain('additive_only')
  })
})

describe('checkClassification', () => {
  const base = {
    archetype: 'sleep_recovery' as const,
    confidence: 0.8,
    metricKey: 'sleep_hours',
    unit: 'h',
    restated: 'Besser schlafen',
    reasoning: 'Der Nutzer nennt Schlaf als Kern des Ziels.',
  }

  it('accepts a well-formed classification', () => {
    expect(checkClassification(base)).toEqual([])
  })

  it('rejects a metric without its unit', () => {
    expect(checkClassification({ ...base, unit: null }).map((v) => v.rule)).toContain('metric_pair')
  })

  it('rejects a diagnosis dressed up as reasoning', () => {
    expect(
      checkClassification({ ...base, reasoning: 'Das klingt nach einer Krankheit, vermutlich Apnoe.' })
        .map((v) => v.rule),
    ).toContain('no_medical_claims')
  })
})

describe('schemas', () => {
  it('rejects an unknown archetype', () => {
    expect(goalClassificationSchema.safeParse({
      archetype: 'productivity', confidence: 0.9, metricKey: null, unit: null,
      restated: 'Mehr schaffen', reasoning: 'Irgendein Grund der lang genug ist.',
    }).success).toBe(false)
  })

  it('rejects confidence outside zero to one', () => {
    expect(goalClassificationSchema.safeParse({
      archetype: 'strength', confidence: 1.4, metricKey: null, unit: null,
      restated: 'Stärker werden', reasoning: 'Irgendein Grund der lang genug ist.',
    }).success).toBe(false)
  })

  it('rejects a proposal with no actions in it', () => {
    expect(planProposalSchema.safeParse({
      headline: 'Woche', reasoning: 'Ein Grund, der lang genug ist um durchzukommen.', actions: [],
    }).success).toBe(false)
  })
})
