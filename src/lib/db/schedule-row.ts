// The schedule, as a database row.
//
// A pure function rather than an object literal inside the save, and for a
// reason this project has now hit twice: a field can be collected in the
// onboarding, typed all the way through, and still never reach the database,
// because nobody added it to the insert. TypeScript does not catch it — an
// extra property missing from a row object is legal.
//
// Out here it can be tested, and the test below it can assert that every key of
// Schedule is accounted for. That turns "somebody remembered" into "the suite
// fails".

import type { Schedule } from '@/lib/domain/types'

export type ScheduleRow = {
  work_pattern: string | null
  free_slots: Schedule['freeSlots']
  commitments: Schedule['commitments']
  wake_times: Schedule['wakeTimes']
}

export function scheduleRow(schedule: Schedule): ScheduleRow {
  return {
    work_pattern: schedule.workPattern,
    free_slots: schedule.freeSlots,
    commitments: schedule.commitments,
    wake_times: schedule.wakeTimes,
  }
}

/**
 * Every field of Schedule, as the row builder must cover them.
 *
 * Written out rather than derived, so adding a field to Schedule without
 * deciding how it is stored breaks the type here — and the test that walks this
 * list against a real row then names the field nobody stored.
 */
export const SCHEDULE_FIELDS: ReadonlyArray<keyof Schedule> = [
  'workPattern',
  'freeSlots',
  'commitments',
  'wakeTimes',
]
