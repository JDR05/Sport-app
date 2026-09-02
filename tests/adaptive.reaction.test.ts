// The reaction is the only place where saying "nicht geschafft" changes the
// plan. That makes it the one adaptive component a user experiences directly
// and immediately, so the tests here are less about statistics and more about
// promises: it never lands work on a day that is past, never stacks two
// sessions of the same domain, never shrinks something below the point where
// doing it is pointless, and never — for the one reason where that would be
// dishonest — pretends to fix anything at all.

import { describe, expect, it } from 'vitest'
import { asksForReason, reactTo, REASON_LABELS, STATUS_REASONS } from '@/lib/adaptive/reaction'
import type { ReactionInput, StatusReason } from '@/lib/adaptive/reaction'
import { MAX_ITEMS_PER_DAY, MIN_VIABLE_SESSION_MINUTES } from '@/lib/engine/constants'
import { addDays, weekdayOf } from '@/lib/engine/dates'
import type { Observation } from '@/lib/adaptive/types'
import type { PlanDomain, PlanItemStatus } from '@/lib/domain/types'
// From the generated types, so a status added by a migration turns up here on
// its own instead of waiting for somebody to remember this file.
import { Constants } from '@/lib/db/database.types'

const ALL_STATUSES = Constants.public.Enums.plan_item_status

const WEEK_START = '2026-09-07' // a Monday
const WEDNESDAY = addDays(WEEK_START, 2)

let seq = 0

function obs(
  date: string,
  overrides: Partial<Observation> = {},
): Observation {
  return {
    itemId: `o${seq++}`,
    scheduledOn: date,
    domain: 'training',
    track: 'goal',
    title: 'Einheit',
    timeSlot: 'evening',
    plannedDurationMin: 45,
    status: 'unknown',
    ...overrides,
  }
}

function input(overrides: Partial<ReactionInput> = {}): ReactionInput {
  return {
    reason: 'no_time',
    item: {
      id: 'missed',
      scheduledOn: WEDNESDAY,
      domain: 'training',
      plannedDurationMin: 45,
    },
    week: [],
    today: WEDNESDAY,
    weekStart: WEEK_START,
    ...overrides,
  }
}

describe('every reason leads somewhere, and somewhere different', () => {
  it('offers a label for each reason', () => {
    for (const reason of STATUS_REASONS) {
      expect(REASON_LABELS[reason]).toBeTruthy()
    }
    // No duplicate wording: two chips reading the same is a tap wasted.
    const labels = STATUS_REASONS.map((r) => REASON_LABELS[r])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('always answers with a message, whatever the reason', () => {
    for (const reason of STATUS_REASONS) {
      const reaction = reactTo(input({ reason }))
      expect(reaction.message.length).toBeGreaterThan(0)
    }
  })

  it('moves the action when the day was the problem', () => {
    for (const reason of ['no_time', 'away'] as StatusReason[]) {
      const reaction = reactTo(input({ reason }))
      expect(reaction.kind).toBe('move')
    }
  })

  it('shortens when the action itself was too much', () => {
    const reaction = reactTo(input({ reason: 'too_much' }))
    expect(reaction.kind).toBe('shorten')
  })

  it('prefers a later day over a shorter session when capacity was the problem', () => {
    for (const reason of ['too_tired', 'unwell'] as StatusReason[]) {
      expect(reactTo(input({ reason })).kind).toBe('move')
    }
  })

  it('falls back to shortening when capacity was the problem and no day is free', () => {
    // Last day of the week, so there is nothing left to move to.
    const sunday = addDays(WEEK_START, 6)
    for (const reason of ['too_tired', 'unwell'] as StatusReason[]) {
      const reaction = reactTo(
        input({
          reason,
          today: sunday,
          item: { id: 'missed', scheduledOn: sunday, domain: 'training', plannedDurationMin: 60 },
        }),
      )
      expect(reaction.kind).toBe('shorten')
    }
  })
})

describe('"keine Lust" deliberately changes nothing', () => {
  it('neither moves nor shortens, however free the week is', () => {
    const reaction = reactTo(input({ reason: 'no_desire', today: WEEK_START, week: [] }))
    expect(reaction.kind).toBe('none')
  })

  it('says out loud that it was noted rather than acted on', () => {
    const reaction = reactTo(input({ reason: 'no_desire' }))
    expect(reaction.message).toMatch(/ohne Umplanen/i)
  })
})

describe('a move lands on a day that actually exists', () => {
  it('never proposes a day in the past', () => {
    const friday = addDays(WEEK_START, 4)
    const reaction = reactTo(
      input({
        today: friday,
        item: { id: 'missed', scheduledOn: WEDNESDAY, domain: 'training', plannedDurationMin: 45 },
      }),
    )
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.toDate >= friday).toBe(true)
  })

  it('never proposes the day the action already sits on', () => {
    const reaction = reactTo(input({ today: WEEK_START }))
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.toDate).not.toBe(WEDNESDAY)
  })

  it('offers today when the day is not over', () => {
    // Missed the morning slot; the evening is still real.
    const reaction = reactTo(
      input({
        today: WEEK_START,
        item: {
          id: 'missed',
          scheduledOn: addDays(WEEK_START, 3),
          domain: 'training',
          plannedDurationMin: 45,
        },
      }),
    )
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.toDate).toBe(WEEK_START)
  })

  it('skips a day that is already at the item ceiling', () => {
    const thursday = addDays(WEEK_START, 3)
    const full = Array.from({ length: MAX_ITEMS_PER_DAY }, () =>
      obs(thursday, { domain: 'nutrition' }),
    )
    const reaction = reactTo(input({ today: WEEK_START, week: full }))
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.toDate).not.toBe(thursday)
  })

  it('says nothing dishonest when the week has no room left', () => {
    // Every remaining day already carries a training session.
    const week: Observation[] = []
    for (let offset = 0; offset < 7; offset++) {
      week.push(obs(addDays(WEEK_START, offset), { domain: 'training' }))
    }
    const reaction = reactTo(input({ today: WEEK_START, week }))
    expect(reaction.kind).toBe('none')
    expect(reaction.message).toMatch(/nichts mehr frei/i)
  })
})

describe('no compensatory logic', () => {
  it('never stacks a second session of the same domain onto one day', () => {
    const domains: PlanDomain[] = ['training', 'nutrition', 'movement', 'sleep']
    for (const domain of domains) {
      // Only Saturday is free of this domain; everything else already has one.
      const saturday = addDays(WEEK_START, 5)
      const week = [0, 1, 2, 3, 4, 6]
        .map((offset) => addDays(WEEK_START, offset))
        .map((date) => obs(date, { domain }))

      const reaction = reactTo(
        input({
          today: WEEK_START,
          week,
          item: { id: 'missed', scheduledOn: WEDNESDAY, domain, plannedDurationMin: 45 },
        }),
      )
      expect(reaction.kind).toBe('move')
      if (reaction.kind === 'move') expect(reaction.toDate).toBe(saturday)
    }
  })

  it('moves rather than duplicates: the reaction carries one target, never two', () => {
    const reaction = reactTo(input())
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') {
      expect(typeof reaction.toDate).toBe('string')
      expect(reaction).not.toHaveProperty('toMinutes')
    }
  })

  it('a shorten only ever makes the week smaller', () => {
    for (const minutes of [30, 45, 60, 90, 120]) {
      const reaction = reactTo(
        input({
          reason: 'too_much',
          item: { id: 'missed', scheduledOn: WEDNESDAY, domain: 'training', plannedDurationMin: minutes },
        }),
      )
      if (reaction.kind === 'shorten') expect(reaction.toMinutes).toBeLessThan(minutes)
    }
  })
})

describe('a shortened session stays worth doing', () => {
  it('never goes below the viable minimum', () => {
    for (let minutes = 5; minutes <= 180; minutes += 5) {
      const reaction = reactTo(
        input({
          reason: 'too_much',
          item: { id: 'missed', scheduledOn: WEDNESDAY, domain: 'training', plannedDurationMin: minutes },
        }),
      )
      if (reaction.kind === 'shorten') {
        expect(reaction.toMinutes).toBeGreaterThanOrEqual(MIN_VIABLE_SESSION_MINUTES)
      }
    }
  })

  it('declines rather than pretending when the session is already minimal', () => {
    for (const minutes of [null, 0, 10, 20, 25, 30]) {
      const reaction = reactTo(
        input({
          reason: 'too_much',
          item: { id: 'missed', scheduledOn: WEDNESDAY, domain: 'training', plannedDurationMin: minutes },
        }),
      )
      // Either an honest no, or a real reduction — never a "shorter" that isn't.
      if (reaction.kind === 'shorten') expect(reaction.toMinutes).toBeLessThan(minutes ?? 0)
      else expect(reaction.kind).toBe('none')
    }
  })

  it('rounds to something a person can read off a clock', () => {
    for (let minutes = 25; minutes <= 180; minutes += 5) {
      const reaction = reactTo(
        input({
          reason: 'too_much',
          item: { id: 'missed', scheduledOn: WEDNESDAY, domain: 'training', plannedDurationMin: minutes },
        }),
      )
      if (reaction.kind === 'shorten') expect(reaction.toMinutes % 5).toBe(0)
    }
  })
})

describe('the move names its evidence', () => {
  it('prefers the weekday this person actually completes', () => {
    const saturday = addDays(WEEK_START, 5)
    const thursday = addDays(WEEK_START, 3)
    // Same week, other domains, so neither day is blocked: Saturday has a
    // perfect record, Thursday a poor one.
    const week: Observation[] = [
      obs(saturday, { domain: 'nutrition', status: 'done' }),
      obs(thursday, { domain: 'nutrition', status: 'missed' }),
      obs(thursday, { domain: 'movement', status: 'missed' }),
    ]
    const reaction = reactTo(input({ today: thursday, week }))
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.toDate).toBe(saturday)
  })

  it('names the weekday and the record it was chosen for', () => {
    const saturday = addDays(WEEK_START, 5)
    const week: Observation[] = [obs(saturday, { domain: 'nutrition', status: 'done' })]
    const reaction = reactTo(input({ today: addDays(WEEK_START, 4), week }))
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') {
      expect(reaction.message).toContain('Samstag')
      expect(reaction.message).toMatch(/geschafft|noch frei/)
    }
  })

  it('does not claim a record for a day it has never seen', () => {
    const reaction = reactTo(input({ today: WEEK_START, week: [] }))
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.message).toMatch(/noch frei/)
  })

  it('breaks ties towards the sooner day', () => {
    // Nothing recorded anywhere, so every candidate scores the same.
    const reaction = reactTo(
      input({
        today: WEEK_START,
        item: {
          id: 'missed',
          scheduledOn: addDays(WEEK_START, 6),
          domain: 'training',
          plannedDurationMin: 45,
        },
      }),
    )
    expect(reaction.kind).toBe('move')
    if (reaction.kind === 'move') expect(reaction.toDate).toBe(WEEK_START)
  })

  it('ignores `unknown` when judging a day, as detection does', () => {
    const friday = addDays(WEEK_START, 4)
    const saturday = addDays(WEEK_START, 5)
    const week: Observation[] = [
      // Friday looks bad only if unresolved actions count as failures.
      obs(friday, { domain: 'nutrition', status: 'unknown' }),
      obs(friday, { domain: 'movement', status: 'unknown' }),
      obs(saturday, { domain: 'nutrition', status: 'missed' }),
    ]
    const reaction = reactTo(input({ today: friday, week }))
    expect(reaction.kind).toBe('move')
    // Friday (unproven, 0.5) beats Saturday (proven bad, 0.0).
    if (reaction.kind === 'move') expect(reaction.toDate).toBe(friday)
  })
})

describe('it holds up across the whole week, for every reason', () => {
  const statuses: PlanItemStatus[] = ['done', 'missed', 'unknown']

  it('never returns a move into the past or onto the same day', () => {
    for (let todayOffset = 0; todayOffset < 7; todayOffset++) {
      const today = addDays(WEEK_START, todayOffset)
      for (let itemOffset = 0; itemOffset <= todayOffset; itemOffset++) {
        const scheduledOn = addDays(WEEK_START, itemOffset)
        for (const reason of STATUS_REASONS) {
          const week = statuses.map((status, i) =>
            obs(addDays(WEEK_START, i), { domain: 'nutrition', status }),
          )
          const reaction = reactTo(
            input({
              reason,
              today,
              week,
              item: { id: 'missed', scheduledOn, domain: 'training', plannedDurationMin: 45 },
            }),
          )
          if (reaction.kind === 'move') {
            expect(reaction.toDate >= today).toBe(true)
            expect(reaction.toDate).not.toBe(scheduledOn)
            // Inside the planned week, never a day the plan does not own.
            expect(reaction.toDate >= WEEK_START).toBe(true)
            expect(reaction.toDate <= addDays(WEEK_START, 6)).toBe(true)
            expect(weekdayOf(reaction.toDate)).toBeTruthy()
          }
        }
      }
    }
  })
})

describe('the question is only asked when there is something to explain', () => {
  it('never asks about a completed action', () => {
    expect(asksForReason('done')).toBe(false)
  })

  it('never asks when a verdict is taken back', () => {
    // Tapping the ring twice is a correction, not a statement. Interrogating
    // somebody for undoing a mis-tap is how an app starts feeling like a
    // second job.
    expect(asksForReason('unknown')).toBe(false)
    expect(asksForReason('planned')).toBe(false)
  })

  it('asks about every way of saying it did not happen', () => {
    for (const status of ['moved', 'missed', 'not_relevant'] as PlanItemStatus[]) {
      expect(asksForReason(status)).toBe(true)
    }
  })

  it('covers the whole status enum, so a new one cannot slip through unconsidered', () => {
    for (const status of ALL_STATUSES) {
      expect(typeof asksForReason(status)).toBe('boolean')
    }
    expect(ALL_STATUSES.filter(asksForReason)).toEqual(['moved', 'missed', 'not_relevant'])
  })
})

describe('a week that is over stays over', () => {
  // The Plan screen lets any day up to today be answered, so an action from
  // last week can reach this function. A plan is written once per week and
  // then fixed: moving that action into this week would leave a row whose
  // date belongs to one plan and whose plan_id belongs to another, and it
  // would show up in neither.
  const lastWednesday = addDays(WEEK_START, -5)

  it('offers nothing for an action outside the week it was handed', () => {
    for (const reason of STATUS_REASONS) {
      const reaction = reactTo(
        input({
          reason,
          today: WEDNESDAY,
          item: {
            id: 'old',
            scheduledOn: lastWednesday,
            domain: 'training',
            plannedDurationMin: 60,
          },
        }),
      )
      expect(reaction.kind).toBe('none')
    }
  })

  it('still takes the reason, and says so', () => {
    const reaction = reactTo(
      input({
        item: { id: 'old', scheduledOn: lastWednesday, domain: 'training', plannedDurationMin: 60 },
      }),
    )
    expect(reaction.message).toMatch(/Auswertung/)
  })

  it('reacts normally on both edges of the week itself', () => {
    for (const offset of [0, 6]) {
      const reaction = reactTo(
        input({
          today: WEEK_START,
          item: {
            id: 'edge',
            scheduledOn: addDays(WEEK_START, offset),
            domain: 'training',
            plannedDurationMin: 60,
          },
        }),
      )
      expect(reaction.kind).toBe('move')
    }
  })
})
