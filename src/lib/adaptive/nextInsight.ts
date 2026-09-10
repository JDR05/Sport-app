// How close the app is to being able to say something.
//
// Six of the eight sections on this screen were empty, and each one explained
// its own emptiness in a paragraph. Eight headings, six apologies, two facts.
// That is not a screen that is waiting for data, it is a screen apologising
// for not having any — and it does it in the place where the app is supposed
// to be at its most useful.
//
// The empty sections are gone. This replaces all of them with one line that
// says the only thing worth saying while they are empty: what is missing, and
// how much of it.
//
// Deliberately not a lowered threshold. The bar is four resolved actions in a
// domain because three is a coincidence, and moving it would buy a sentence at
// the cost of the sentence being true. What was actually wrong was that the
// app never said how far away it was — so somebody rating nothing and somebody
// one action short saw exactly the same empty screen.

import { MIN_DISTINCT_WEEKS, MIN_RESOLVED_INSTANCES } from './constants'
// The same two helpers detection itself uses. Re-deriving either here would
// let this line and the thing it is counting towards drift apart, which is the
// one way a progress indicator can be worse than none.
import { isResolved } from './detect'
import { startOfWeek } from '@/lib/engine/dates'
import type { Observation } from './types'
import type { PlanDomain } from '@/lib/domain/types'

/** What the app is still waiting for, in the terms the person can act on. */
export type NextInsight = {
  /** Which domain is closest, or null when nothing has been rated at all. */
  domain: PlanDomain | null
  /** Ratings still needed before detection can run. Never below 1. */
  missing: number
  done: number
  /**
   * What the bar counts up to — always `done + missing`.
   *
   * Not the raw threshold. The bar showed `done` out of four while the line
   * beside it could say "five more", because the count includes ratings needed
   * in *other* domains to form a comparison group. A bar and a sentence
   * disagreeing about the same wait is the app arguing with itself.
   */
  needed: number
}

/**
 * The domain that needs the fewest further ratings before detection can run.
 *
 * "Closest" rather than "first" or "largest": the point of the line is to be
 * reachable. Telling somebody they need eleven more ratings in a domain they
 * ignore is the same as telling them nothing.
 *
 * A domain that already clears both thresholds is skipped rather than ending
 * the search. Detection has had its chance there; if it found nothing, that is
 * an answer and not a shortage, and there is nothing to wait for in *that*
 * domain — but a different one may still be one rating away. Ending the search
 * at the first sufficient domain was the first version of this, and it went
 * silent on the exact account it was written for: nutrition had thirteen
 * ratings and no pattern, movement was one short, and the screen said nothing.
 *
 * Returns null only when nothing anywhere is still short.
 */
export function nextInsight(observations: readonly Observation[]): NextInsight | null {
  const resolvedPerDomain = new Map<PlanDomain, number>()
  const weeksPerDomain = new Map<PlanDomain, Set<string>>()

  for (const o of observations) {
    if (!isResolved(o)) continue
    resolvedPerDomain.set(o.domain, (resolvedPerDomain.get(o.domain) ?? 0) + 1)
    const weeks = weeksPerDomain.get(o.domain) ?? new Set<string>()
    weeks.add(startOfWeek(o.scheduledOn))
    weeksPerDomain.set(o.domain, weeks)
  }

  // Nothing rated at all. The first rating is the thing to ask for, and naming
  // a domain here would be picking one at random.
  if (resolvedPerDomain.size === 0) {
    return { domain: null, missing: MIN_RESOLVED_INSTANCES, done: 0, needed: MIN_RESOLVED_INSTANCES }
  }

  // Detection needs a comparison group as well as a bucket: a shortfall
  // measured against nothing is not a contrast, which `assess` enforces with
  // the same minimum on `rest`. Modelling only the bucket let this line fill
  // its bar and produce nothing — a progress indicator that can complete
  // without the thing it was counting towards is worse than none.
  const totalResolved = [...resolvedPerDomain.values()].reduce((sum, n) => sum + n, 0)

  let best: NextInsight | null = null
  for (const [domain, done] of resolvedPerDomain) {
    const weeks = weeksPerDomain.get(domain)?.size ?? 0
    // Enough here already, so nothing to wait for in this domain. Not a reason
    // to stop looking at the others.
    if (done >= MIN_RESOLVED_INSTANCES && weeks >= MIN_DISTINCT_WEEKS) continue

    // What this domain still needs, and what everything *around* it still
    // needs, whichever is further away. Naming a domain that is one rating
    // short while the rest of the week has two answers in it would be pointing
    // at the wrong thing.
    // Added, not maximised. They are different actions: a rating in another
    // domain fills this one's comparison group without touching its bucket, so
    // somebody with three movement answers and nothing else needs one more
    // movement *and* four elsewhere. Taking the larger of the two was the
    // first version and it under-counted every time both were short.
    const inDomain = Math.max(0, MIN_RESOLVED_INSTANCES - done)
    const inRest = Math.max(0, MIN_RESOLVED_INSTANCES - (totalResolved - done))
    const missing = Math.max(1, inDomain + inRest)
    if (best === null || missing < best.missing) {
      best = { domain, missing, done, needed: done + missing }
    }
  }
  return best
}
