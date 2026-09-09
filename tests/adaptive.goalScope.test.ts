// Which half of the analysis is allowed to see an abandoned goal's actions.
//
// The analysis window is six weeks and a goal can change inside it. The account
// this was written for had four goals in three weeks and 32 of its 81 actions
// belonged to goals that had been dropped — all of them feeding every sentence
// the app produced about the person.
//
// Both readings are defensible, about different questions. "I miss Wednesday
// evenings" is a fact about somebody's week and stays true whatever the action
// was for, so deviation detection counts everything. "Ernährung funktioniert
// bei dir" is not: nine nutrition actions completed for a goal since abandoned
// say nothing about the goal being pursued now.

import { describe, expect, it } from 'vitest'
import { analyze } from '@/lib/adaptive'
import { makeInput, PROFILES, GOALS } from './fixtures/profiles'
import type { Observation } from '@/lib/adaptive/types'
import type { PlanDomain, PlanItemStatus } from '@/lib/domain/types'

let seq = 0
function obs(
  domain: PlanDomain,
  status: PlanItemStatus,
  scheduledOn: string,
  fromCurrentGoal?: boolean,
): Observation {
  return {
    itemId: `i${seq++}`,
    scheduledOn,
    domain,
    track: 'goal',
    title: `${domain} action`,
    timeSlot: 'evening',
    plannedDurationMin: 40,
    status,
    ...(fromCurrentGoal === undefined ? {} : { fromCurrentGoal }),
  }
}

const input = { ...makeInput(PROFILES[3], GOALS[0]), today: '2026-09-21' }
const DAYS = ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-03', '2026-09-10', '2026-09-17']

/**
 * One domain going well against another going badly.
 *
 * A strength needs a contrast, not just a run of successes — "you complete
 * everything" is not a finding. Nutrition at 100% against movement at 0% is.
 */
function contrast(fromCurrentGoal?: boolean): Observation[] {
  return [
    ...Array.from({ length: 6 }, (_, i) =>
      obs('nutrition', 'done', DAYS[i % DAYS.length], fromCurrentGoal),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      obs('movement', 'missed', DAYS[i % DAYS.length], fromCurrentGoal),
    ),
  ]
}

describe('strengths only count the goal being pursued now', () => {
  it('finds a strength when the actions belong to the current goal', () => {
    const analysis = analyze(input, contrast(true))
    expect(analysis.strengths.length).toBeGreaterThan(0)
  })

  it('finds none when the very same actions belonged to an abandoned goal', () => {
    // The only difference between this and the case above is the flag. If this
    // ever passes with a strength, the scoping has stopped happening.
    const analysis = analyze(input, contrast(false))
    expect(analysis.strengths).toEqual([])
  })

  it('treats an unmarked observation as current, so an omission widens rather than empties', () => {
    // Most callers build observations without the flag. Defaulting the other
    // way would blank every strength in the app the first time one was missed.
    expect(analyze(input, contrast()).strengths.length).toBeGreaterThan(0)
  })
})

describe('deviations count every goal, because a week belongs to the person', () => {
  // Six misses in one domain across three weeks, all from goals since dropped,
  // against a comparison group that went fine.
  const missedOld = Array.from({ length: 6 }, (_, i) =>
    obs('movement', 'missed', DAYS[i % DAYS.length], false),
  )
  const doneOld = Array.from({ length: 8 }, (_, i) =>
    obs('nutrition', 'done', DAYS[i % DAYS.length], false),
  )

  it('still sees the shortfall', () => {
    const analysis = analyze(input, [...missedOld, ...doneOld])
    expect(analysis.deviations.length).toBeGreaterThan(0)
  })

  it('sees the same shortfall whether or not the goal is still active', () => {
    const asCurrent = [...missedOld, ...doneOld].map((o) => ({ ...o, fromCurrentGoal: true }))
    expect(analyze(input, asCurrent).deviations.length).toBe(
      analyze(input, [...missedOld, ...doneOld]).deviations.length,
    )
  })
})
