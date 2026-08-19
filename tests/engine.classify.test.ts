// The deterministic classifier — the fallback that keeps the product usable
// without an API key.

import { describe, expect, it } from 'vitest'
import { classifyGoalText } from '@/lib/engine'
import type { GoalArchetype } from '@/lib/domain/types'

const CASES: Array<[string, GoalArchetype]> = [
  ['Ich möchte 5 kg abnehmen', 'body_composition'],
  ['endlich wieder auf mein altes Gewicht kommen', 'body_composition'],
  ['Ich will stärker werden', 'strength'],
  ['20 Klimmzüge am Stück schaffen', 'strength'],
  ['10 km am Stück laufen können', 'endurance'],
  ['einen Halbmarathon schaffen', 'endurance'],
  ['Ich will endlich besser schlafen', 'sleep_recovery'],
  ['morgens nicht mehr so müde sein', 'sleep_recovery'],
  ['mich gesünder ernähren', 'nutrition_quality'],
  ['weniger Zucker essen', 'nutrition_quality'],
  ['weniger am Handy sein', 'habit_routine'],
  ['jeden Tag meditieren', 'habit_routine'],
  ['früher aufstehen', 'habit_routine'],
]

describe('classifyGoalText', () => {
  it.each(CASES)('classifies %s', (text, expected) => {
    expect(classifyGoalText(text).archetype).toBe(expected)
  })

  it('falls back to general health rather than failing', () => {
    const result = classifyGoalText('Ich will einfach ein besserer Mensch werden')
    expect(result.archetype).toBe('general_health')
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('handles an empty goal without throwing', () => {
    expect(classifyGoalText('   ').archetype).toBe('general_health')
  })

  it('never claims certainty — that is what the AI classifier is for', () => {
    for (const [text] of CASES) {
      expect(classifyGoalText(text).confidence).toBeLessThanOrEqual(0.8)
    }
  })
})
