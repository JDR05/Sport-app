// A contrast has to come from somewhere.
//
// Detection groups observations along an axis and asks whether one group is
// worse than the rest. The catch is what "the rest" means: an action with no
// time of day has no position on the time-of-day axis at all. It was correctly
// left out of the groups and then counted in the comparison anyway — and since
// every plan mixes timed sessions with untimed daily routines, and routines
// mostly succeed, that manufactured a gap out of nothing.

import { describe, expect, it } from 'vitest'
import { detectDeviations } from '@/lib/adaptive'
import type { Observation, } from '@/lib/adaptive'
import type { PlanItemStatus, TimeSlot } from '@/lib/domain/types'

let seq = 0
function obs(
  date: string,
  status: PlanItemStatus,
  timeSlot: TimeSlot | null,
  minutes: number | null = 45,
): Observation {
  seq += 1
  return {
    itemId: `i${seq}`,
    scheduledOn: date,
    domain: 'training',
    track: 'goal',
    title: 'x',
    timeSlot,
    plannedDurationMin: minutes,
    status,
  }
}

/** Four weeks of Mondays and Thursdays, evenings and middays, all equal. */
function evenWeeks(): Observation[] {
  const out: Observation[] = []
  const mondays = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']
  for (const monday of mondays) {
    const thursday = `2026-08-${String(Number(monday.slice(8)) + 3).padStart(2, '0')}`
    out.push(obs(monday, 'done', 'evening'), obs(monday, 'missed', 'evening'))
    out.push(obs(thursday, 'done', 'midday'), obs(thursday, 'missed', 'midday'))
  }
  return out
}

/** Daily routines: no time of day, no duration, and they get done. */
function routines(): Observation[] {
  const out: Observation[] = []
  for (let day = 3; day <= 14; day++) {
    out.push(obs(`2026-08-${String(day).padStart(2, '0')}`, 'done', null, null))
  }
  return out
}

describe('untimed actions are not evidence about times of day', () => {
  it('finds nothing when the two slots are genuinely equal', () => {
    const found = detectDeviations(evenWeeks()).filter((d) => d.dimension === 'time_slot')
    expect(found).toEqual([])
  })

  it('still finds nothing once daily routines are added', () => {
    // The routines succeed and have no slot. Counting them as "the rest" used
    // to drop the comparison miss rate far enough to flag BOTH slots at once —
    // two findings that contradict each other, from a week where nothing
    // differed.
    const found = detectDeviations([...evenWeeks(), ...routines()]).filter(
      (d) => d.dimension === 'time_slot',
    )
    expect(found).toEqual([])
  })

  it('says the same about session length', () => {
    const found = detectDeviations([...evenWeeks(), ...routines()]).filter(
      (d) => d.dimension === 'duration',
    )
    expect(found).toEqual([])
  })

  it('still finds a real difference between two slots', () => {
    // The guard must not silence detection: evenings genuinely worse than
    // middays is exactly what this is for.
    const real: Observation[] = []
    for (const monday of ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']) {
      const thursday = `2026-08-${String(Number(monday.slice(8)) + 3).padStart(2, '0')}`
      real.push(obs(monday, 'missed', 'evening'), obs(monday, 'missed', 'evening'))
      real.push(obs(thursday, 'done', 'midday'), obs(thursday, 'done', 'midday'))
    }
    const found = detectDeviations([...real, ...routines()]).filter(
      (d) => d.dimension === 'time_slot',
    )
    expect(found.length).toBe(1)
    expect(found[0].bucket).toBe('evening')
  })
})
