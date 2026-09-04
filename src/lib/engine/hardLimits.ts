// The person's own hard limits, applied last.
//
// A hard constraint is not the engine's opinion — it is something somebody
// stated about their own life: "never more than fifteen minutes", "never on a
// Tuesday". Every track is supposed to respect them while planning, and every
// track mostly does. Mostly is the problem.
//
// Measured over 7000 generated people, the second most common way this app
// refused to work at all was a plan that broke a hard session cap: the tracks
// built it, `assertPlanInvariants` caught it, and the person was shown "Plan
// nicht möglich" — told a safety limit had rejected them, for having set a
// limit of their own. Three separate archetypes had independently written
// `Math.max(FLOOR, Math.min(wanted, cap))`, which applies the cap and then
// raises the result back above it.
//
// So this is a final pass rather than a rule each track has to remember. It
// only ever makes a week smaller: shorten what can be shortened, drop what
// cannot, never move and never add. That direction is what makes it safe to
// run over the finished plan — under-planning is recoverable, and the
// invariants still have the last word afterwards.

import { MIN_VIABLE_SESSION_MINUTES } from './constants'
import { isExertion } from './safety'
import type { PlanInput, PlannedItem } from '@/lib/domain/types'

/** The strictest hard cap this person set, or null. */
export function hardSessionCap(input: PlanInput): number | null {
  let cap: number | null = null
  for (const c of input.constraints) {
    if (c.hard && c.value.type === 'max_session_minutes') {
      cap = cap === null ? c.value.minutes : Math.min(cap, c.value.minutes)
    }
  }
  return cap
}

/**
 * The plan's items, with every hard session cap honoured.
 *
 * The cap applies to **anything with a duration**, not only to training. The
 * invariant checks exertion alone, and its reasoning — "a ninety minute
 * movement block breaks a forty-five minute limit just as thoroughly" — argues
 * for widening rather than narrowing: somebody who says "never more than eight
 * minutes" is describing the blocks of time their day has, and a fifteen-minute
 * meditation does not fit one either. Measured over a generated population,
 * those were the cases the invariant let through and the person still noticed.
 *
 * Exertion and everything else then part company, and the asymmetry is the
 * point:
 *
 *   * **A session** below the viable floor stops being a session. Ten minutes
 *     of strength training is a number on a screen, so it is dropped, and the
 *     week is built out of what does fit — nutrition, sleep, movement.
 *   * **Everything else** shortens and stays. Five minutes of breathing is
 *     shorter breathing; there is no floor under which it stops being itself,
 *     and dropping it would leave a habit goal with nothing in it.
 */
export function applyHardLimits(items: PlannedItem[], input: PlanInput): PlannedItem[] {
  const cap = hardSessionCap(input)
  if (cap === null) return items

  const kept: PlannedItem[] = []
  for (const item of items) {
    const minutes = item.plannedDurationMin
    if (minutes === null || minutes <= cap) {
      kept.push(item)
      continue
    }
    // A cap below the viable floor is a person saying sessions do not fit.
    if (isExertion(item) && cap < MIN_VIABLE_SESSION_MINUTES) continue

    kept.push({ ...item, plannedDurationMin: cap })
  }
  return kept
}
