// When the app is allowed to speak up.
//
// The dangerous direction here is eagerness, not silence. An impulse that
// arrives because something genuinely happened is the reason to open the app;
// one that arrives because a threshold was low is a notification, and an app
// that comments on everything is one people stop reading. So most of these
// tests assert that nothing fires.

import { describe, expect, it } from 'vitest'
import {
  detectTrigger, IMPULSE_TRIGGERS, MIN_DAYS_BETWEEN_IMPULSES, MIN_DOMAIN_MISSES,
  MIN_GOOD_RUN, MIN_REPEATED_REASONS, WEEKLY_IMPULSE_FROM_DAY,
  type ImpulseTrigger, type TriggerInput,
} from '@/lib/adaptive/triggers'
import { addDays } from '@/lib/engine/dates'
import type { Observation } from '@/lib/adaptive/types'
import type { PlanDomain, PlanItemStatus } from '@/lib/domain/types'

const WEEK_START = '2026-09-07' // a Monday
const TUESDAY = addDays(WEEK_START, 1)
const THURSDAY = addDays(WEEK_START, 3)

let seq = 0
function obs(status: PlanItemStatus, domain: PlanDomain = 'training', day = 1): Observation {
  return {
    itemId: `o${seq++}`,
    scheduledOn: addDays(WEEK_START, day),
    domain,
    track: 'goal',
    title: 'Einheit',
    timeSlot: 'evening',
    plannedDurationMin: 45,
    status,
  }
}

function input(overrides: Partial<TriggerInput> = {}): TriggerInput {
  return {
    today: TUESDAY,
    weekStart: WEEK_START,
    week: [],
    reasons: [],
    used: [],
    lastImpulseOn: null,
    ...overrides,
  }
}

describe('most days, nothing happens', () => {
  it('says nothing about an empty week', () => {
    expect(detectTrigger(input())).toBeNull()
  })

  it('says nothing on Monday about an ordinary week', () => {
    // The calendar trigger waits for Thursday, and one done and one missed is
    // not an event. Something that genuinely happened may still fire on a
    // Monday — that is the whole point of the change — but it has to have
    // happened.
    const quiet = detectTrigger(
      input({ today: WEEK_START, week: [obs('done'), obs('missed')] }),
    )
    expect(quiet).toBeNull()
  })

  it('does not treat one bad day as an event', () => {
    const week = [obs('missed'), obs('missed')]
    expect(detectTrigger(input({ week }))).toBeNull()
  })

  it('does not treat two of the same reason as a pattern', () => {
    // Two is a coincidence, and everybody has one bad pair of days.
    const reasons = [{ reason: 'too_tired' as const, domain: 'training', count: 2 }]
    expect(detectTrigger(input({ reasons }))).toBeNull()
  })
})

describe('a reason given three times is a fact about the week', () => {
  const reasons = [
    { reason: 'too_tired' as const, domain: 'training', count: MIN_REPEATED_REASONS },
  ]

  it('fires, even on a Tuesday', () => {
    const found = detectTrigger(input({ reasons }))
    expect(found?.trigger).toBe('reason_repeated')
  })

  it('says what was given and how often, in the person’s own words', () => {
    const found = detectTrigger(input({ reasons }))
    expect(found?.occasion).toContain('Zu müde')
    expect(found?.occasion).toContain('3×')
    // The distinction that makes this the strongest signal the app has.
    expect(found?.occasion).toContain('selbst angegeben')
  })

  it('ignores "Anderes", which is the escape hatch rather than an answer', () => {
    const other = [{ reason: 'other' as const, domain: 'training', count: 5 }]
    expect(detectTrigger(input({ reasons: other }))).toBeNull()
  })

  it('outranks everything the app merely counted', () => {
    // What somebody said about themselves beats what the app inferred, always.
    const found = detectTrigger(
      input({
        today: THURSDAY,
        reasons,
        week: [obs('missed'), obs('missed'), obs('missed')],
      }),
    )
    expect(found?.trigger).toBe('reason_repeated')
  })
})

describe('a domain going nowhere', () => {
  it('fires when nothing in it worked', () => {
    const week = Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'nutrition'))
    const found = detectTrigger(input({ week }))
    expect(found?.trigger).toBe('domain_slipping')
    expect(found?.occasion).toContain('Ernährung')
  })

  it('stays quiet when the same domain also worked', () => {
    // Three missed alongside one done is a busy week, not a domain coming
    // apart — and telling somebody their nutrition is slipping in a week they
    // hit it is the kind of wrong that costs the app its credibility.
    const week = [
      ...Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'nutrition')),
      obs('done', 'nutrition'),
    ]
    expect(detectTrigger(input({ week }))).toBeNull()
  })

  it('does not add up misses across different domains', () => {
    const week = [obs('missed', 'training'), obs('missed', 'nutrition'), obs('missed', 'movement')]
    expect(detectTrigger(input({ week }))).toBeNull()
  })

  it('cites the actions it is talking about', () => {
    const week = Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'sleep'))
    const found = detectTrigger(input({ week }))
    expect(found?.evidence.length).toBeGreaterThan(0)
    expect(week.map((o) => o.itemId)).toEqual(expect.arrayContaining(found!.evidence))
  })
})

describe('the app speaks up when things go right, too', () => {
  // An app that comments on failure and goes quiet on success is a complaint
  // mechanism. "Rückschläge sind Lernsignal" only means something if the other
  // direction is a signal as well.
  it('fires on a clean run', () => {
    const week = Array.from({ length: MIN_GOOD_RUN }, () => obs('done'))
    const found = detectTrigger(input({ week }))
    expect(found?.trigger).toBe('going_well')
  })

  it('does not call a coin flip a good run', () => {
    const week = [
      ...Array.from({ length: MIN_GOOD_RUN }, () => obs('done')),
      ...Array.from({ length: MIN_GOOD_RUN }, () => obs('missed', 'nutrition')),
    ]
    const found = detectTrigger(input({ week }))
    expect(found?.trigger).not.toBe('going_well')
  })

  it('needs enough completed actions to mean anything', () => {
    const week = Array.from({ length: MIN_GOOD_RUN - 1 }, () => obs('done'))
    expect(detectTrigger(input({ week }))).toBeNull()
  })

  it('ranks a shortfall above a good run, because a shortfall is actionable today', () => {
    const week = [
      ...Array.from({ length: MIN_GOOD_RUN }, () => obs('done', 'movement')),
      ...Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'training')),
    ]
    expect(detectTrigger(input({ week }))?.trigger).toBe('domain_slipping')
  })
})

describe('the calendar is still an occasion, and the last one', () => {
  it('fires from Thursday on an ordinary week', () => {
    const week = [obs('done'), obs('missed')]
    expect(detectTrigger(input({ today: THURSDAY, week }))?.trigger).toBe('weekly')
  })

  it('does not fire before then', () => {
    const week = [obs('done'), obs('missed')]
    for (let day = 0; day < WEEKLY_IMPULSE_FROM_DAY; day++) {
      expect(detectTrigger(input({ today: addDays(WEEK_START, day), week }))).toBeNull()
    }
  })

  it('gives way to anything that actually happened', () => {
    const week = Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'nutrition'))
    expect(detectTrigger(input({ today: THURSDAY, week }))?.trigger).toBe('domain_slipping')
  })
})

describe('it cannot become a notification feed', () => {
  it('holds two days between impulses, whatever happened', () => {
    const reasons = [{ reason: 'no_time' as const, domain: 'training', count: 9 }]
    for (let gap = 0; gap < MIN_DAYS_BETWEEN_IMPULSES; gap++) {
      const found = detectTrigger(
        input({ today: THURSDAY, reasons, lastImpulseOn: addDays(THURSDAY, -gap) }),
      )
      expect(found).toBeNull()
    }
  })

  it('speaks again once the gap has passed', () => {
    const reasons = [{ reason: 'no_time' as const, domain: 'training', count: 9 }]
    const found = detectTrigger(
      input({
        today: THURSDAY,
        reasons,
        lastImpulseOn: addDays(THURSDAY, -MIN_DAYS_BETWEEN_IMPULSES),
      }),
    )
    expect(found?.trigger).toBe('reason_repeated')
  })

  it('never repeats an occasion inside one week', () => {
    const reasons = [{ reason: 'too_tired' as const, domain: 'training', count: 9 }]
    const week = Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'nutrition'))

    // The reason fired first; next time the same week, it has to move on.
    const second = detectTrigger(input({ today: THURSDAY, reasons, week, used: ['reason_repeated'] }))
    expect(second?.trigger).toBe('domain_slipping')

    const third = detectTrigger(
      input({ today: THURSDAY, reasons, week, used: ['reason_repeated', 'domain_slipping'] }),
    )
    expect(third?.trigger).toBe('weekly')

    const fourth = detectTrigger(
      input({
        today: THURSDAY,
        reasons,
        week,
        used: ['reason_repeated', 'domain_slipping', 'weekly'],
      }),
    )
    expect(fourth).toBeNull()
  })

  it('runs out after four, so one week cannot produce five', () => {
    // The ceiling is structural: four kinds exist, each fires once. Combined
    // with the two-day gap, a week holds at most three in practice.
    const everything = detectTrigger(
      input({
        today: THURSDAY,
        reasons: [{ reason: 'too_tired' as const, domain: 'training', count: 9 }],
        week: [
          ...Array.from({ length: MIN_GOOD_RUN }, () => obs('done', 'movement')),
          ...Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'nutrition')),
        ],
        used: [...IMPULSE_TRIGGERS] as ImpulseTrigger[],
      }),
    )
    expect(everything).toBeNull()
  })
})

describe('every trigger it can return is one the database accepts', () => {
  it('returns nothing outside the known set', () => {
    // The check constraint on weekly_notes lists these four. A fifth invented
    // here would fail the insert at runtime, in the one path that must never
    // throw.
    const cases: TriggerInput[] = [
      input({ reasons: [{ reason: 'too_tired', domain: 'training', count: 9 }] }),
      input({ week: Array.from({ length: MIN_DOMAIN_MISSES }, () => obs('missed', 'nutrition')) }),
      input({ week: Array.from({ length: MIN_GOOD_RUN }, () => obs('done')) }),
      input({ today: THURSDAY, week: [obs('done'), obs('missed')] }),
    ]
    for (const c of cases) {
      const found = detectTrigger(c)
      expect(found).not.toBeNull()
      expect(IMPULSE_TRIGGERS).toContain(found!.trigger)
    }
  })
})
