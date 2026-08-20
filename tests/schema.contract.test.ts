// The seam between the database and the engine.
//
// Two lists describe the same set of goal archetypes: the Postgres enum, which
// arrives here through the generated Constants, and GOAL_ARCHETYPES, which the
// registry iterates over. They drift the moment someone adds an archetype in a
// migration and forgets the strategy, or the other way round — and neither
// mistake shows up until a real user picks the goal that fell through.

import { describe, expect, it } from 'vitest'
import { Constants } from '@/lib/db/database.types'
import { GOAL_ARCHETYPES, WEEKDAYS } from '@/lib/domain/types'
import { ARCHETYPES, strategyFor } from '@/lib/engine'

describe('goal archetypes', () => {
  it('are the same set in the database and in the domain', () => {
    expect([...GOAL_ARCHETYPES].sort()).toEqual(
      [...Constants.public.Enums.goal_archetype].sort(),
    )
  })

  it('every one the database allows has a strategy behind it', () => {
    // The registry requires assertInvariants, so this also proves that no goal
    // type can be stored that ships without its own safety limits. ADR-025.
    for (const archetype of Constants.public.Enums.goal_archetype) {
      const strategy = strategyFor(archetype)
      expect(strategy, archetype).toBeDefined()
      expect(strategy.archetype).toBe(archetype)
      expect(typeof strategy.assertInvariants).toBe('function')
    }
  })

  it('has no strategy for something the database cannot store', () => {
    const known = new Set<string>(Constants.public.Enums.goal_archetype)
    for (const strategy of Object.values(ARCHETYPES)) {
      expect(known.has(strategy.archetype), strategy.archetype).toBe(true)
    }
  })
})

describe('other shared vocabulary', () => {
  it('tracks match the database enum', () => {
    expect([...Constants.public.Enums.plan_track].sort()).toEqual(['baseline', 'goal'])
  })

  it('only `missed` is a behavioural failure', () => {
    // Pinned so that adding a status in a migration forces a decision about
    // whether pattern detection should count it. See ADR-011.
    expect([...Constants.public.Enums.plan_item_status].sort()).toEqual([
      'done', 'missed', 'moved', 'not_relevant', 'planned', 'unknown',
    ])
  })

  it('weekdays start on Monday', () => {
    expect(WEEKDAYS[0]).toBe('mon')
    expect(WEEKDAYS).toHaveLength(7)
  })
})
