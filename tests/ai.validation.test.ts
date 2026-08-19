// What the AI layer is actually for: catching output that is well-formed but
// not allowed. A schema-valid suggestion can still tell someone to skip meals.

import { describe, expect, it } from 'vitest'
import { checkClassification, checkSuggestions } from '@/lib/ai'
import { goalClassificationSchema, suggestionsSchema } from '@/lib/ai/schemas'
import type { Suggestions } from '@/lib/ai'

function withSuggestion(over: Partial<Suggestions['suggestions'][number]>): Suggestions {
  return {
    headline: 'Eine ruhige Woche',
    suggestions: [
      {
        title: 'Abends kurz spazieren',
        reasoning: 'Du hast angegeben, überwiegend sitzend zu arbeiten, und abends Zeit zu haben.',
        domain: 'movement',
        effortMinutes: 15,
        ...over,
      },
    ],
  }
}

describe('checkSuggestions', () => {
  it('accepts an additive, person-specific suggestion', () => {
    expect(checkSuggestions(withSuggestion({}))).toEqual([])
  })

  it.each([
    ['verzichte auf Zucker', 'additive_only'],
    ['Streiche das Abendessen', 'additive_only'],
    ['Keine Kohlenhydrate mehr am Abend', 'additive_only'],
    ['Probier mal Fasten aus', 'additive_only'],
  ])('rejects restriction framing: %s', (title, rule) => {
    const violations = checkSuggestions(withSuggestion({ title }))
    expect(violations.map((v) => v.rule)).toContain(rule)
  })

  it('rejects calorie and macro numbers, which the app computes itself', () => {
    expect(checkSuggestions(withSuggestion({ title: 'Bleib bei 1400 kcal am Tag' })).map((v) => v.rule))
      .toContain('no_numeric_health_claims')
    expect(checkSuggestions(withSuggestion({ title: 'Iss 120 g Protein' })).map((v) => v.rule))
      .toContain('no_numeric_health_claims')
  })

  it('rejects any suggestion to sleep less, under any goal', () => {
    const violations = checkSuggestions(
      withSuggestion({ reasoning: 'Steh früher auf um zu trainieren, dafür etwas weniger Schlaf.' }),
    )
    expect(violations.map((v) => v.rule)).toContain('never_less_sleep')
  })

  it('rejects medical and supplement claims', () => {
    expect(checkSuggestions(withSuggestion({ title: 'Nimm ein Magnesium-Supplement' })).map((v) => v.rule))
      .toContain('no_medical_claims')
    expect(checkSuggestions(withSuggestion({ reasoning: 'Das heilt deine Schlafstörung zuverlässig.' })).map((v) => v.rule))
      .toContain('no_medical_claims')
  })

  it('rejects effort nobody will fit into a day', () => {
    expect(checkSuggestions(withSuggestion({ effortMinutes: 60 })).map((v) => v.rule))
      .toContain('realistic_effort')
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

  it('rejects an empty or oversized suggestion list', () => {
    expect(suggestionsSchema.safeParse({ headline: 'Woche', suggestions: [] }).success).toBe(false)
  })
})
