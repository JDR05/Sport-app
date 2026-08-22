// A date that has already passed is not a deadline.
//
// Four archetypes — Schlaf, Gesundheitsbasis, Gewohnheit, Ernährung — took
// whatever was typed and put it straight into the strategy. It came back
// marked `adjusted: false`, and Progress printed it under the words "wie
// gewünscht": a deadline months gone, presented as the plan working as
// intended. Nobody wished for it. It was a mistyped year, or a goal picked up
// again after a long pause.
//
// The three rate-capped archetypes got the right answer by accident — a
// negative number of weeks is fewer than the safe number, so the clamp caught
// it on the way past. That stopped working the moment there was no rate to
// cap: a target volume already reached, or no metric at all.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { horizonFor } from '@/lib/engine/horizon'
import { formatGermanDateShort } from '@/lib/engine/dates'
import { GOALS, makeInput, PROFILES, TODAY } from './fixtures/profiles'
import type { NamedGoal } from './fixtures/profiles'

const YESTERDAY = '2026-08-18'
const LAST_YEAR = '2025-11-14'

describe('horizonFor', () => {
  it('keeps a date that is still ahead', () => {
    const h = horizonFor(TODAY, '2026-12-24', 12)
    expect(h.targetDate).toBe('2026-12-24')
    expect(h.adjusted).toBe(false)
    expect(h.note).toBe('')
  })

  it('treats no date as no wish, not a wrong one', () => {
    // "offen" is a legitimate answer. Marking it as adjusted would tell
    // someone the app changed something they never asked for.
    const h = horizonFor(TODAY, null, 12)
    expect(h.adjusted).toBe(false)
    expect(h.note).toBe('')
    expect(h.targetDate > TODAY).toBe(true)
  })

  it('moves a date that has passed and says so', () => {
    const h = horizonFor(TODAY, LAST_YEAR, 12)
    expect(h.adjusted).toBe(true)
    expect(h.targetDate > TODAY).toBe(true)
    expect(h.note).toContain('14. November 2025')
    // K6: a substitution, never a refusal.
    expect(h.note).not.toMatch(/nicht möglich|geht nicht/)
  })

  it('moves today itself, because a plan needs somewhere to go', () => {
    expect(horizonFor(TODAY, TODAY, 12).adjusted).toBe(true)
    expect(horizonFor(TODAY, YESTERDAY, 12).adjusted).toBe(true)
  })
})

/** The same goal, with a different date typed into it. */
function on(goal: NamedGoal, targetDate: string): NamedGoal {
  return { ...goal, goal: { ...goal.goal, targetDate } }
}

const EVERY_GOAL = GOALS.map((g) => ({ name: g.name, goal: g }))

describe('every archetype, given a date that has passed', () => {
  it.each(EVERY_GOAL)('$name moves it into the future', ({ goal }) => {
    const plan = generatePlan(makeInput(PROFILES[0], on(goal, LAST_YEAR)))

    expect(plan.strategy.targetDate).not.toBeNull()
    expect(plan.strategy.targetDate! > TODAY).toBe(true)
  })

  it.each(EVERY_GOAL)('$name does not call it "wie gewünscht"', ({ goal }) => {
    // The flag is what Progress reads to choose between "angepasst" and
    // "wie gewünscht". Getting the date right and the flag wrong would put
    // an honest date under a dishonest label.
    const plan = generatePlan(makeInput(PROFILES[0], on(goal, LAST_YEAR)))
    expect(plan.strategy.targetDateAdjusted).toBe(true)
  })

  it.each(EVERY_GOAL)('$name never promises the date that had passed', ({ goal }) => {
    const plan = generatePlan(makeInput(PROFILES[0], on(goal, LAST_YEAR)))
    const said = plan.rationale.map((r) => r.text).join(' ')
    expect(said).not.toContain('bis zum 14. November 2025')
  })

  // The three rate-capped archetypes answer with their own sentence — "5 kg
  // bis zum 3. November, das sind 0,4 kg pro Woche" — which is the better
  // explanation and already names a date in the future. The four with no rate
  // to cap have nothing else to say, so they say what was moved.
  const RATE_FREE = EVERY_GOAL.filter(({ goal }) =>
    ['sleep_recovery', 'nutrition_quality', 'habit_routine', 'general_health'].includes(
      goal.archetype,
    ),
  )

  it.each(RATE_FREE)('$name names the date it replaced', ({ goal }) => {
    const plan = generatePlan(makeInput(PROFILES[0], on(goal, LAST_YEAR)))
    const said = plan.rationale.map((r) => r.text).join(' ')
    expect(said).toContain('14. November 2025')
    expect(said).toContain('Vergangenheit')
  })

  it.each(EVERY_GOAL)('$name never plans towards yesterday', ({ goal }) => {
    // The shared invariant, from the other side: whatever an archetype does
    // with the date, generatePlan refuses a strategy pointing backwards.
    for (const date of [YESTERDAY, TODAY, LAST_YEAR, '2027-06-01']) {
      const plan = generatePlan(makeInput(PROFILES[0], on(goal, date)))
      expect(plan.strategy.targetDate === null || plan.strategy.targetDate > TODAY).toBe(true)
    }
  })
})

describe('the date on the Fortschritt tile', () => {
  it('drops the year only when it is this year', () => {
    expect(formatGermanDateShort('2026-11-14', TODAY)).toBe('14. November')
  })

  it('keeps the year when it is any other', () => {
    // The old code stripped it unconditionally, so a goal date from last
    // November and one from this November read identically.
    expect(formatGermanDateShort('2025-11-14', TODAY)).toBe('14. November 2025')
    expect(formatGermanDateShort('2027-11-14', TODAY)).toBe('14. November 2027')
  })
})
