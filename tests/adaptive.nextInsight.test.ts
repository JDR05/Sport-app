// The one line that replaces six empty sections.
//
// The Muster screen used to carry eight headings, six of which explained their
// own emptiness in a paragraph. Somebody who had rated nothing and somebody one
// rating short of an answer saw exactly the same screen — which is the worst
// property a waiting state can have, because the second person was about to
// get something and had no way to know.
//
// The numbers in the "real account" block below are the ones this app actually
// held when the screen was reviewed: 21 rated actions across four domains, and
// movement sitting one short of the bar.

import { describe, expect, it } from 'vitest'
import { nextInsight } from '@/lib/adaptive/nextInsight'
import { MIN_RESOLVED_INSTANCES } from '@/lib/adaptive/constants'
import type { Observation } from '@/lib/adaptive/types'
import type { PlanDomain, PlanItemStatus } from '@/lib/domain/types'

let seq = 0
function obs(domain: PlanDomain, status: PlanItemStatus, scheduledOn: string): Observation {
  return {
    itemId: `i${seq++}`,
    scheduledOn,
    domain,
    track: 'goal',
    title: 't',
    timeSlot: null,
    plannedDurationMin: null,
    status,
  }
}

/** n rated actions in a domain, spread across two weeks so only the count is short. */
function rated(domain: PlanDomain, n: number, status: PlanItemStatus = 'done'): Observation[] {
  const days = ['2026-09-01', '2026-09-02', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-15']
  return Array.from({ length: n }, (_, i) => obs(domain, status, days[i % days.length]))
}

describe('the bar and the sentence agree', () => {
  // The bar counted towards the raw threshold while the sentence counted every
  // rating still needed, including the ones in other domains that form the
  // comparison group. Four out of four, and "noch zwei" beside it.
  it('always counts up to what is actually left', () => {
    for (const observations of [
      rated('movement', 3),
      [...rated('nutrition', 6), ...rated('movement', 3)],
      [...rated('nutrition', 1), ...rated('sleep', 2)],
    ]) {
      const result = nextInsight(observations)
      if (result === null) continue
      expect(result.needed).toBe(result.done + result.missing)
      expect(result.done).toBeLessThanOrEqual(result.needed)
    }
  })
})

describe('what the app is still waiting for', () => {
  it('asks for the first rating when nothing has been rated', () => {
    const result = nextInsight([obs('training', 'planned', '2026-09-01')])
    expect(result).toEqual({
      domain: null,
      missing: MIN_RESOLVED_INSTANCES,
      done: 0,
      needed: MIN_RESOLVED_INSTANCES,
    })
  })

  it('names the domain that is closest, not the biggest', () => {
    // Nutrition has plenty behind it, so it doubles as movement's comparison
    // group and movement is genuinely one rating away. The reachable one is
    // the one worth naming — "eleven more in a domain you ignore" is noise.
    const result = nextInsight([...rated('nutrition', 6), ...rated('movement', 3)])
    expect(result?.domain).toBe('movement')
    expect(result?.missing).toBe(1)
  })

  it('counts what the comparison group still needs, not just the domain', () => {
    // Three movement answers and nothing else is not one rating away from a
    // pattern. Detection compares a bucket against the rest of the week, and
    // there is no rest yet: one more in movement, four anywhere else.
    expect(nextInsight(rated('movement', 3))?.missing).toBe(5)
  })

  it('goes quiet once a domain has enough', () => {
    // Detection has had its chance. Silence then means "no pattern", which is
    // an answer — and asking for more ratings would be the app blaming the
    // person for its own quiet.
    expect(nextInsight(rated('nutrition', MIN_RESOLVED_INSTANCES))).toBeNull()
  })

  it('keeps waiting when the count is met but the weeks are not', () => {
    // Four misses inside one week are one bad week, which is exactly what the
    // distinct-week rule exists to reject.
    const oneWeek = Array.from({ length: 6 }, () => obs('sleep', 'done', '2026-09-01'))
    expect(nextInsight(oneWeek)).not.toBeNull()
  })

  it('ignores actions nobody answered', () => {
    const result = nextInsight([...rated('training', 1), ...Array.from({ length: 20 }, () => obs('training', 'planned', '2026-09-03'))])
    expect(result?.done).toBe(1)
  })

  it('counts a missed action as data, because it is', () => {
    // "I did not do it" is the more informative answer of the two, and a
    // progress bar that only moved on success would be a streak counter. The
    // number is the same whichever way the three went.
    expect(nextInsight(rated('movement', 3, 'missed'))?.missing).toBe(
      nextInsight(rated('movement', 3, 'done'))?.missing,
    )
    expect(nextInsight(rated('movement', 3, 'missed'))?.done).toBe(3)
  })

  describe('the real account this was built for', () => {
    // 13 nutrition, 3 sleep, 3 movement, 2 training — all rated, three weeks.
    const real = [
      ...rated('nutrition', 13),
      ...rated('sleep', 3),
      ...rated('movement', 2, 'missed'),
      ...rated('movement', 1),
      ...rated('training', 2),
    ]

    it('says exactly one rating is missing, and where', () => {
      const result = nextInsight(real)
      expect(result).not.toBeNull()
      expect(result?.missing).toBe(1)
      expect(['movement', 'sleep']).toContain(result?.domain)
    })

    it('moves on to the next-closest domain once that one arrives', () => {
      // Not silence: sleep sits at three ratings too. Falling silent here was
      // the expectation this test was written with, and it was wrong — the
      // account has two domains one rating short, and answering one of them
      // does not answer the other.
      expect(nextInsight([...real, ...rated('movement', 1)])?.domain).toBe('sleep')
    })

    it('falls silent when every domain has enough', () => {
      const full = [
        ...rated('nutrition', 4), ...rated('sleep', 4),
        ...rated('movement', 4), ...rated('training', 4),
      ]
      expect(nextInsight(full)).toBeNull()
    })
  })
})
