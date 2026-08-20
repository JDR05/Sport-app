// Nothing may be lost on the way to a row and back.
//
// This is the quiet-failure seam. If `track` is dropped, the health baseline
// and the goal track become indistinguishable once stored, and the rule that
// the baseline must never crowd out the goal stops being checkable. If
// `basedOn` is dropped, a recommendation survives that cannot point at the
// input it came from — which principle 4 says must not exist. Neither shows up
// as an error; the screen still renders, just slightly less true.
//
// So the round trip is checked against every item of every plan the engine can
// produce, not against a handful of hand-written examples.

import { describe, expect, it } from 'vitest'
import { fromRow, toInsert, type ItemRow } from '@/lib/db/item-mapping'
import { generatePlan } from '@/lib/engine'
import { ALL_COMBINATIONS } from './fixtures/profiles'

/** What Postgres hands back for a row that was just inserted. */
function roundTrip(insert: ReturnType<typeof toInsert>): ItemRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    scheduled_on: insert.scheduled_on,
    domain: insert.domain,
    track: insert.track,
    title: insert.title,
    planned_duration_min: insert.planned_duration_min,
    time_slot: insert.time_slot,
    rationale: insert.rationale,
    rationale_based_on: insert.rationale_based_on,
    details: insert.details,
    status: insert.status,
  }
}

describe('a planned action survives being stored', () => {
  it('comes back identical, for every item of all 70 plans', () => {
    let checked = 0

    for (const { name, input } of ALL_COMBINATIONS) {
      for (const item of generatePlan(input).items) {
        const back = fromRow(roundTrip(toInsert(item, 'plan-id', 'profile-id')))

        expect(back.scheduledOn, name).toBe(item.scheduledOn)
        expect(back.domain, name).toBe(item.domain)
        expect(back.track, name).toBe(item.track)
        expect(back.title, name).toBe(item.title)
        expect(back.plannedDurationMin, name).toBe(item.plannedDurationMin)
        expect(back.timeSlot, name).toBe(item.timeSlot)
        expect(back.rationale.text, name).toBe(item.rationale.text)
        expect(back.rationale.basedOn, name).toEqual(item.rationale.basedOn)
        expect(back.details, name).toEqual(item.details)
        checked++
      }
    }

    // A guard against the test silently checking nothing.
    expect(checked).toBeGreaterThan(500)
  })

  it('keeps the evidence a recommendation rests on', () => {
    for (const { name, input } of ALL_COMBINATIONS) {
      for (const item of generatePlan(input).items) {
        const back = fromRow(roundTrip(toInsert(item, 'p', 'u')))
        expect(back.rationale.text.length, name).toBeGreaterThan(0)
        expect(back.rationale.basedOn.length, name).toBeGreaterThan(0)
      }
    }
  })

  it('starts every action as unknown, never as missed', () => {
    // An action nobody has touched is missing information, not a failure.
    // ADR-011 — this is the single line that keeps tracking fatigue out of
    // pattern detection.
    const item = generatePlan(ALL_COMBINATIONS[0].input).items[0]
    expect(toInsert(item, 'p', 'u').status).toBe('unknown')
  })
})

describe('a row that is not quite right', () => {
  const base: ItemRow = {
    id: 'x',
    scheduled_on: '2026-08-20',
    domain: 'training',
    track: 'goal',
    title: 'Training',
    planned_duration_min: 45,
    time_slot: 'evening',
    rationale: 'weil',
    rationale_based_on: ['profile.sport'],
    details: {},
    status: 'unknown',
  }

  it('drops a time slot it does not recognise instead of trusting it', () => {
    expect(fromRow({ ...base, time_slot: 'nachts' }).timeSlot).toBeNull()
    expect(fromRow({ ...base, time_slot: null }).timeSlot).toBeNull()
  })

  it('survives a rationale that is missing or malformed', () => {
    expect(fromRow({ ...base, rationale: null }).rationale.text).toBe('')
    expect(fromRow({ ...base, rationale_based_on: 'nope' }).rationale.basedOn).toEqual([])
    expect(fromRow({ ...base, rationale_based_on: [1, 'ok', null] }).rationale.basedOn).toEqual([
      'ok',
    ])
  })

  it('survives details being null', () => {
    expect(fromRow({ ...base, details: null }).details).toEqual({})
  })
})
