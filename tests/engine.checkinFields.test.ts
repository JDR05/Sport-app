// The check-in must not become a second job.
//
// Nine columns exist. Asking all nine every evening is exactly the "fühlt sich
// wie ein zweiter Job an" the brief forbids, and it is also how answers stop
// being honest — people who feel interrogated tap the middle option.

import { describe, expect, it } from 'vitest'
import {
  checkInFields, CHECKIN_FIELDS, MAX_CHECKIN_FIELDS,
} from '@/lib/engine/checkin-fields'
import type { GoalArchetype } from '@/lib/domain/types'

const ARCHETYPES: GoalArchetype[] = [
  'body_composition', 'strength', 'endurance', 'sleep_recovery',
  'nutrition_quality', 'habit_routine', 'general_health',
]

describe('what each goal is asked', () => {
  it('never asks more than six things', () => {
    for (const archetype of ARCHETYPES) {
      expect(checkInFields(archetype).length).toBeLessThanOrEqual(MAX_CHECKIN_FIELDS)
    }
  })

  it('always asks energy, mood and sleep', () => {
    for (const archetype of ARCHETYPES) {
      expect(checkInFields(archetype)).toEqual(
        expect.arrayContaining(['energy', 'mood', 'sleepHours']),
      )
    }
  })

  it('asks nothing twice', () => {
    for (const archetype of ARCHETYPES) {
      const fields = checkInFields(archetype)
      expect(new Set(fields).size).toBe(fields.length)
    }
  })

  it('only asks about things that exist', () => {
    for (const archetype of ARCHETYPES) {
      for (const field of checkInFields(archetype)) {
        expect(CHECKIN_FIELDS).toContain(field)
      }
    }
  })

  it('does not ask a sleep goal about muscle soreness', () => {
    expect(checkInFields('sleep_recovery')).not.toContain('soreness')
  })

  it('does not ask a strength goal about a glass of wine', () => {
    expect(checkInFields('strength')).not.toContain('alcoholUnits')
  })

  it('asks a sleep goal what actually moves a night', () => {
    const fields = checkInFields('sleep_recovery')
    expect(fields).toEqual(expect.arrayContaining(['caffeineLate', 'alcoholUnits', 'stress']))
  })

  it('gives two goals with different levers different questions', () => {
    // If every archetype asked the same set, the relevance would be a claim
    // rather than a behaviour — the same test the plan engine has to pass.
    const nutrition = checkInFields('nutrition_quality').join()
    const sleep = checkInFields('sleep_recovery').join()
    const strength = checkInFields('strength').join()
    expect(new Set([nutrition, sleep, strength]).size).toBe(3)
  })
})
