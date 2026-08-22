// A pattern without a cause implies the person is the cause.
//
// These tests hold the attribution to two promises: it only speaks when the
// data supports it, and it never grades anybody.

import { describe, expect, it } from 'vitest'
import { attribute, type DayContext } from '@/lib/adaptive/attribution'
import {
  ALCOHOL_GAP_UNITS, MIN_CONTEXT_DAYS, SCALE_GAP, SLEEP_GAP_HOURS,
} from '@/lib/adaptive/constants'
import type { Deviation } from '@/lib/adaptive'
import type { Commitment } from '@/lib/domain/types'

const TUESDAY: Deviation = {
  dimension: 'weekday',
  bucket: 'tue',
  domain: 'training',
  resolved: 8,
  missed: 5,
  missRate: 0.63,
  comparisonMissRate: 0.15,
  distinctWeeks: 4,
  evidence: ['a', 'b'],
}

const football: Commitment = {
  label: 'Fußballtraining',
  weekday: 'tue',
  start: '19:00',
  minutes: 120,
  kind: 'sport',
  activity: 'football',
}

/** Six Tuesdays and six Thursdays, starting on a known Tuesday. */
function days(tuesday: Partial<DayContext>, other: Partial<DayContext>): DayContext[] {
  const base: DayContext = {
    date: '', energy: null, mood: null, stress: null, sleepHours: null,
    dietQuality: null, soreness: null, alcoholUnits: null, caffeineLate: null,
  }
  const out: DayContext[] = []
  for (let week = 0; week < 6; week++) {
    const day = 4 + week * 7 // 2026-08-04 is a Tuesday
    out.push({ ...base, ...tuesday, date: `2026-08-${String(day).padStart(2, '0')}` })
    out.push({ ...base, ...other, date: `2026-08-${String(day + 2).padStart(2, '0')}` })
  }
  return out
}

describe('what was different about those days', () => {
  it('names a commitment that runs late, with the time it ends', () => {
    const [found] = attribute(TUESDAY, [], [football])
    expect(found.factor).toBe('late_commitment')
    expect(found.statement).toContain('Fußballtraining')
    expect(found.statement).toContain('21:00')
  })

  it('ignores a commitment that is over in good time', () => {
    const morning: Commitment = { ...football, start: '07:00', minutes: 90 }
    expect(attribute(TUESDAY, [], [morning])).toEqual([])
  })

  it('names shorter sleep when the gap is real', () => {
    const found = attribute(TUESDAY, days({ sleepHours: 5.5 }, { sleepHours: 7.5 }), [])
    const sleep = found.find((a) => a.factor === 'short_sleep')
    expect(sleep).toBeDefined()
    expect(sleep?.onBucket).toBeCloseTo(5.5)
    expect(sleep?.statement).toContain('5,5 h')
  })

  it('stays quiet when the sleep gap is below the threshold', () => {
    const tiny = days({ sleepHours: 7 }, { sleepHours: 7 + SLEEP_GAP_HOURS - 0.1 })
    expect(attribute(TUESDAY, tiny, []).some((a) => a.factor === 'short_sleep')).toBe(false)
  })

  it('reads stress upwards and energy downwards', () => {
    const found = attribute(
      TUESDAY,
      days({ stress: 4.5, energy: 2 }, { stress: 2, energy: 4 }),
      [],
    )
    expect(found.map((a) => a.factor)).toContain('high_stress')
    expect(found.map((a) => a.factor)).toContain('low_energy')

    // The mirror image must not fire: calm, energetic days are not a finding.
    const calm = attribute(TUESDAY, days({ stress: 2, energy: 4 }, { stress: 4.5, energy: 2 }), [])
    expect(calm.map((a) => a.factor)).not.toContain('high_stress')
    expect(calm.map((a) => a.factor)).not.toContain('low_energy')
  })

  it('needs enough rated days on both sides before it says anything', () => {
    const sparse: DayContext[] = days({ sleepHours: 5 }, { sleepHours: 8 })
      .filter((d, i) => i % 2 === 1 || i < (MIN_CONTEXT_DAYS - 1) * 2)
    const rated = sparse.filter((d) => d.date.endsWith('04') || d.date.endsWith('11'))
    expect(rated.length).toBeLessThan(MIN_CONTEXT_DAYS)
    expect(attribute(TUESDAY, rated, []).some((a) => a.factor === 'short_sleep')).toBe(false)
  })

  it('skips missing values instead of counting them as zero', () => {
    // Two logged nights among six. Zero-filling would read as four sleepless
    // nights and produce a confident, wrong finding.
    const mostlyBlank = days({ sleepHours: null }, { sleepHours: 8 }).map((d, i) =>
      i === 0 || i === 2 ? { ...d, sleepHours: 7.9 } : d,
    )
    expect(attribute(TUESDAY, mostlyBlank, []).some((a) => a.factor === 'short_sleep')).toBe(false)
  })

  it('says nothing about a pattern a check-in cannot speak to', () => {
    // A day's energy explains nothing about why evenings differ from mornings.
    const evenings: Deviation = { ...TUESDAY, dimension: 'time_slot', bucket: 'evening' }
    expect(attribute(evenings, days({ energy: 1 }, { energy: 5 }), [football])).toEqual([])
  })
})

describe('the vocabulary', () => {
  it('has no word for blame', () => {
    const found = attribute(
      TUESDAY,
      days(
        { sleepHours: 5, energy: 2, stress: 4.5, soreness: 4.5, dietQuality: 2 },
        { sleepHours: 8, energy: 4, stress: 2, soreness: 2, dietQuality: 4 },
      ),
      [football],
    )
    expect(found.length).toBeGreaterThan(0)
    for (const a of found) {
      expect(a.statement.toLowerCase()).not.toMatch(
        /motivier|diszipl|faul|versag|schwach|ausrede|konsequent|reiß dich/,
      )
    }
  })

  it('claims a difference, never a cause', () => {
    // "X ist der Grund" over six days is a claim the data cannot carry.
    const found = attribute(TUESDAY, days({ sleepHours: 5 }, { sleepHours: 8 }), [football])
    for (const a of found) {
      expect(a.statement.toLowerCase()).not.toMatch(/\bder grund\b|\bweil du\b|\bliegt daran\b/)
    }
  })
})

describe('the two upward scales', () => {
  it('reads soreness like stress, not like energy', () => {
    const sore = attribute(TUESDAY, days({ soreness: 4.5 }, { soreness: 2 }), [])
    expect(sore.map((a) => a.factor)).toContain('high_soreness')

    // Fresh legs on the affected days are not a finding.
    const fresh = attribute(TUESDAY, days({ soreness: 2 }, { soreness: 4.5 }), [])
    expect(fresh.map((a) => a.factor)).not.toContain('high_soreness')
  })

  it('reads diet like energy: worse is the finding', () => {
    const poor = attribute(TUESDAY, days({ dietQuality: 2 }, { dietQuality: 4 }), [])
    expect(poor.map((a) => a.factor)).toContain('poor_diet')

    const good = attribute(TUESDAY, days({ dietQuality: 4 }, { dietQuality: 2 }), [])
    expect(good.map((a) => a.factor)).not.toContain('poor_diet')
  })
})

describe('the numbers behind a statement', () => {
  it('reports both averages so the user can check them', () => {
    const found = attribute(TUESDAY, days({ energy: 2 }, { energy: 4 }), [])
    const energy = found.find((a) => a.factor === 'low_energy')!
    expect(energy.onBucket).toBeCloseTo(2)
    expect(energy.elsewhere).toBeCloseTo(4)
    expect(energy.elsewhere! - energy.onBucket!).toBeGreaterThanOrEqual(SCALE_GAP)
  })
})

// Both questions are asked under a sleep goal, every evening, and for weeks
// nothing read them. An evening question that never comes back as an answer
// teaches people that the check-in is busywork — which is worse than not
// having asked.
describe('the two questions a sleep goal asks', () => {
  it('names late caffeine when it clusters on those days', () => {
    const found = attribute(TUESDAY, days({ caffeineLate: true }, { caffeineLate: false }), [])
    const caffeine = found.find((a) => a.factor === 'late_caffeine')

    expect(caffeine).toBeDefined()
    expect(caffeine?.statement).toContain('100 %')
    expect(caffeine?.statement).toContain('0 %')
  })

  it('stays quiet when it happens about as often either way', () => {
    const even = days({ caffeineLate: true }, { caffeineLate: true })
    expect(attribute(TUESDAY, even, []).some((a) => a.factor === 'late_caffeine')).toBe(false)
  })

  it('needs a gap wider than a coincidence', () => {
    // Just under the bar: the difference is there and is not called a finding.
    const narrow = days({ alcoholUnits: 2 }, { alcoholUnits: 2 - ALCOHOL_GAP_UNITS + 0.1 })
    expect(attribute(TUESDAY, narrow, []).some((a) => a.factor === 'alcohol')).toBe(false)
  })

  it('names alcohol with both averages and no verdict', () => {
    const found = attribute(TUESDAY, days({ alcoholUnits: 3 }, { alcoholUnits: 0 }), [])
    const alcohol = found.find((a) => a.factor === 'alcohol')

    expect(alcohol).toBeDefined()
    expect(alcohol?.onBucket).toBeCloseTo(3)
    expect(alcohol?.elsewhere).toBeCloseTo(0)
    // The module's own rule: state what was different, never why, and never
    // grade the person for it.
    expect(alcohol?.statement).not.toMatch(/Grund|zu viel|solltest|weniger/)
  })

  it('never speaks from one answer', () => {
    // MIN_CONTEXT_DAYS applies here like everywhere else. A single Tuesday
    // beer is not a pattern about Tuesdays.
    const thin: DayContext[] = days({}, {}).map((d, i) =>
      i === 0 ? { ...d, alcoholUnits: 5 } : d,
    )
    expect(attribute(TUESDAY, thin, []).some((a) => a.factor === 'alcohol')).toBe(false)
  })
})
