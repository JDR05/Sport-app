// The feel of a gesture, as arithmetic.
//
// A pull-to-refresh is judged entirely by two things nobody can assert from a
// screenshot: that it does not fire while somebody is scrolling, and that it
// does fire when they meant it to. Both are this function. The phone this
// would otherwise be tested on is not available from here, so the part that
// can be pinned down is pinned down.

import { describe, expect, it } from 'vitest'
import { fillFor, pullFor, wouldRefresh } from '@/components/PullToRefresh'

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

// ---------------------------------------------------------------------------
// The ring, not the bar.
//
// The indicator was a full-width hairline with "Zum Aktualisieren ziehen" under
// it, drawn over the sticky header. "Macht einfach so herunterziehen und es
// kommt so'n kleiner Kreis, der sich so füllt."
//
// The ring is now the only feedback there is — no bar, no sentence — so how full
// it is has to mean exactly one thing: whether letting go would reload.

describe('how full the ring is', () => {
  it('is empty before the gesture starts', () => {
    expect(fillFor(0)).toBe(0)
  })

  it('closes exactly where releasing would refresh', () => {
    // The ring closing and the gesture arming are one event. If these two ever
    // disagree, the person is looking at a full circle that does nothing, or a
    // gap that reloads.
    const pulls = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 96]
    for (const pull of pulls) {
      expect(fillFor(pull) >= 1, `pull ${pull}`).toBe(wouldRefresh(pull))
    }
  })

  it('fills evenly on the way there', () => {
    // Monotonic, so the ring never goes backwards while the finger goes down.
    let previous = -1
    for (let pull = 0; pull <= 64; pull += 4) {
      const fill = fillFor(pull)
      expect(fill).toBeGreaterThanOrEqual(previous)
      previous = fill
    }
  })

  it('does not overfill on a long drag', () => {
    expect(fillFor(500)).toBe(1)
  })

  it('stays empty for an upward drag and for nonsense', () => {
    for (const bad of [-1, -400, NaN, Infinity]) {
      expect(fillFor(bad), String(bad)).toBe(0)
    }
  })
})
