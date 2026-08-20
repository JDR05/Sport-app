// The join between the two halves of the product.
//
// The adaptive engine was built and tested long before anything was stored, on
// hand-made observations. This checks that what the database actually produces
// is the same shape — otherwise the learning loop is proven against a fiction.

import { describe, expect, it } from 'vitest'
import { analysisWindowStart, toObservations } from '@/lib/db/observations'
import type { StoredItem } from '@/lib/db/week-plan'
import { detectDeviations, analyze } from '@/lib/adaptive'
import { generatePlan } from '@/lib/engine'
import { fromRow, toInsert, type ItemRow } from '@/lib/db/item-mapping'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'
import { WEEK_STARTS } from './fixtures/observations'
import type { PlanItemStatus } from '@/lib/domain/types'

/** Items as they come back from the database, with a status applied. */
function storedWeek(weekStart: string, status: (weekday: number) => PlanItemStatus): StoredItem[] {
  const input = { ...makeInput(PROFILES[4], GOALS[1]), today: weekStart }
  return generatePlan(input).items.map((item, index) => {
    const row: ItemRow = {
      ...toInsert(item, 'plan', 'user'),
      id: `${weekStart}-${index}`,
      status: status(new Date(item.scheduledOn).getUTCDay()),
    }
    return fromRow(row)
  })
}

describe('stored items become observations', () => {
  it('carries every field detection needs', () => {
    const items = storedWeek(WEEK_STARTS[0], () => 'done')
    const observations = toObservations(items)

    expect(observations.length).toBe(items.length)
    for (const o of observations) {
      expect(o.itemId).toBeTruthy()
      expect(o.scheduledOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['goal', 'baseline']).toContain(o.track)
      expect(o.status).toBe('done')
    }
  })

  it('passes unknown through instead of filtering it here', () => {
    // The rule that `unknown` never counts lives in detection, with the
    // reasoning. Applying it twice would put it in two places, and the copy
    // nobody reads is the one that goes wrong.
    const items = storedWeek(WEEK_STARTS[0], () => 'unknown')
    expect(toObservations(items).every((o) => o.status === 'unknown')).toBe(true)
    expect(detectDeviations(toObservations(items))).toEqual([])
  })
})

describe('the full loop, on data shaped like the database produces it', () => {
  it('finds a repeated weekday problem across real stored weeks', () => {
    // Wednesday missed, everything else done, four weeks running.
    const WEDNESDAY = 3
    const items = WEEK_STARTS.flatMap((week) =>
      storedWeek(week, (day) => (day === WEDNESDAY ? 'missed' : 'done')),
    )

    const observations = toObservations(items)
    const weekday = detectDeviations(observations).find((d) => d.dimension === 'weekday')

    expect(weekday?.bucket).toBe('wed')
    expect(weekday?.distinctWeeks).toBe(4)
    expect(weekday?.evidence.length).toBeGreaterThan(0)
  })

  it('proposes exactly one safe experiment from it', () => {
    const WEDNESDAY = 3
    const items = WEEK_STARTS.flatMap((week) =>
      storedWeek(week, (day) => (day === WEDNESDAY ? 'missed' : 'done')),
    )

    const analysis = analyze(makeInput(PROFILES[4], GOALS[1]), toObservations(items))

    expect(analysis.experiment).not.toBeNull()
    expect(analysis.experiment?.variable).toBe('weekday')
    // Every insight can point at the rows it came from.
    for (const insight of analysis.insights) {
      expect(insight.evidence.length).toBeGreaterThan(0)
    }
  })

  it('stays silent on a single quiet week', () => {
    const WEDNESDAY = 3
    const items = storedWeek(WEEK_STARTS[0], (day) => (day === WEDNESDAY ? 'missed' : 'done'))
    const analysis = analyze(makeInput(PROFILES[4], GOALS[1]), toObservations(items))

    expect(analysis.deviations).toEqual([])
    expect(analysis.experiment).toBeNull()
  })
})

describe('the analysis window', () => {
  it('spans exactly six calendar weeks, including this one', () => {
    // 2026-08-20 is a Thursday; its week starts Monday 2026-08-17.
    // Five weeks earlier is 2026-07-13, so the window covers 17.8., 10.8.,
    // 3.8., 27.7., 20.7. and 13.7. — six Mondays.
    expect(analysisWindowStart('2026-08-20')).toBe('2026-07-13')
  })

  it('starts on a Monday whatever day it is asked on', () => {
    for (const day of ['2026-08-17', '2026-08-20', '2026-08-23']) {
      expect(analysisWindowStart(day)).toBe('2026-07-13')
    }
  })

  it('is a single week when asked for one', () => {
    expect(analysisWindowStart('2026-08-20', 1)).toBe('2026-08-17')
  })
})
