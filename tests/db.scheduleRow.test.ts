// Collected, typed, and never stored.
//
// This project has produced that bug twice: a single wake_time nothing ever
// read, and check-ins nothing ever concluded from. Both looked correct in the
// type checker — an insert object that omits a property is perfectly legal
// TypeScript. Only the round trip catches it, so this test walks every field of
// Schedule and insists it comes out the other side.

import { describe, expect, it } from 'vitest'
import { scheduleRow, SCHEDULE_FIELDS, type ScheduleRow } from '@/lib/db/schedule-row'
import { readCommitments, readFreeSlots, readWakeTimes, readWorkPattern } from '@/lib/db/schemas'
import type { Schedule } from '@/lib/domain/types'

const full: Schedule = {
  workPattern: 'shift',
  freeSlots: [{ weekday: 'thu', start: '19:00', minutes: 60 }],
  commitments: [
    { label: 'Fußballtraining', weekday: 'tue', start: '19:00', minutes: 120, kind: 'sport', activity: 'football' },
  ],
  wakeTimes: { wed: '05:00', sat: '09:30' },
}

/** Reading a row back the way plan-input does. */
function readBack(row: ScheduleRow): Schedule {
  return {
    workPattern: readWorkPattern(row.work_pattern),
    freeSlots: readFreeSlots(row.free_slots),
    commitments: readCommitments(row.commitments),
    wakeTimes: readWakeTimes(row.wake_times),
  }
}

describe('the schedule survives a round trip', () => {
  it('comes back exactly as it went in', () => {
    expect(readBack(scheduleRow(full))).toEqual(full)
  })

  it('stores something for every field the domain type has', () => {
    // The list is written out by hand, and its type is keyof Schedule — so a
    // new field on Schedule that nobody added here fails to compile, and a new
    // field added here but not stored fails right below.
    const row = scheduleRow(full) as Record<string, unknown>
    expect(SCHEDULE_FIELDS.length).toBe(Object.keys(full).length)
    expect(Object.keys(row).length).toBe(SCHEDULE_FIELDS.length)
  })

  it('keeps a partial week partial', () => {
    // Two days answered stays two days. Filling the rest in would hand the
    // engine five wake times nobody gave it.
    const partial = { ...full, wakeTimes: { wed: '05:00' } }
    expect(readBack(scheduleRow(partial)).wakeTimes).toEqual({ wed: '05:00' })
  })

  it('drops a nonsense wake time rather than storing it', () => {
    // Deliberately untyped: this is what a row looks like coming *back* out of
    // the database, where nothing has checked it. An hour that does not exist
    // and a day that is not a day are dropped, and the rest survives.
    const fromDatabase = {
      ...scheduleRow(full),
      wake_times: { wed: '25:00', xyz: '06:00', thu: '06:15' } as unknown as Schedule['wakeTimes'],
    }
    expect(readBack(fromDatabase).wakeTimes).toEqual({ thu: '06:15' })
  })
})
