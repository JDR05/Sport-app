// The feel of a gesture, as arithmetic.
//
// A pull-to-refresh is judged entirely by two things nobody can assert from a
// screenshot: that it does not fire while somebody is scrolling, and that it
// does fire when they meant it to. Both are this function. The phone this
// would otherwise be tested on is not available from here, so the part that
// can be pinned down is pinned down.

import { describe, expect, it } from 'vitest'
import { pullFor, wouldRefresh } from '@/components/PullToRefresh'

describe('an upward drag is a scroll, not a negative pull', () => {
  it.each([-500, -64, -1, 0])('stays at zero for %d', (delta) => {
    expect(pullFor(delta)).toBe(0)
  })

  it('survives a nonsense delta rather than propagating NaN into a style', () => {
    // A height of NaN is an invisible element and an inline style the browser
    // drops silently. Zero is the safe direction for anything that is not a
    // real distance, infinity included.
    expect(pullFor(Number.NaN)).toBe(0)
    expect(pullFor(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('resistance', () => {
  it('moves the indicator half as far as the finger', () => {
    expect(pullFor(40)).toBe(20)
    expect(pullFor(100)).toBe(50)
  })

  it('never grows without bound, however long the drag', () => {
    const far = pullFor(10_000)
    expect(far).toBe(pullFor(100_000))
    expect(far).toBeLessThanOrEqual(96)
  })

  it('is monotonic, so the bar never goes backwards mid-pull', () => {
    let previous = 0
    for (let delta = 0; delta <= 400; delta += 7) {
      const next = pullFor(delta)
      expect(next).toBeGreaterThanOrEqual(previous)
      previous = next
    }
  })
})

describe('the threshold', () => {
  it('does not fire on a short tug', () => {
    // Roughly the distance a thumb travels settling onto a list. A gesture
    // that fires by accident is worse than one that is missing.
    expect(wouldRefresh(pullFor(60))).toBe(false)
  })

  it('fires on a deliberate pull', () => {
    expect(wouldRefresh(pullFor(160))).toBe(true)
  })

  it('is reachable before the indicator maxes out', () => {
    // If the cap were below the threshold, the gesture could never fire —
    // and it would look like it was about to the whole time.
    expect(wouldRefresh(pullFor(10_000))).toBe(true)
  })
})
