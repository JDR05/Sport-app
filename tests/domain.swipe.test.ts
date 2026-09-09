// The gesture that has to work before anything else in this app does.
//
// Nothing the product claims — patterns, experiments, personal rules — happens
// without a verdict on a planned action, and 74% of them never got one. So the
// cost of giving one is the product's real bottleneck, and the geometry of the
// gesture is worth testing rather than eyeballing.

import { describe, expect, it } from 'vitest'
import {
  isHorizontal, SWIPE_MAX_PX, SWIPE_THRESHOLD_PX, swipeOffset, swipeProgress, swipeVerdict,
} from '@/lib/domain/swipe'

describe('which answer a gesture means', () => {
  it('reads right as done and left as missed', () => {
    expect(swipeVerdict(SWIPE_THRESHOLD_PX)).toBe('done')
    expect(swipeVerdict(-SWIPE_THRESHOLD_PX)).toBe('missed')
  })

  it('refuses anything short of the threshold', () => {
    expect(swipeVerdict(SWIPE_THRESHOLD_PX - 1)).toBeNull()
    expect(swipeVerdict(-(SWIPE_THRESHOLD_PX - 1))).toBeNull()
    expect(swipeVerdict(0)).toBeNull()
  })

  it('answers at exactly the threshold, not one pixel past it', () => {
    // A boundary nobody can feel, so it has to be decided here rather than
    // discovered by a person whose swipe keeps not registering.
    expect(swipeVerdict(SWIPE_THRESHOLD_PX)).not.toBeNull()
  })
})

describe('scroll versus swipe', () => {
  it('ignores the first few pixels in any direction', () => {
    // Every touch is ambiguous at the start. Without a dead zone, scrolling
    // the list nudges every card it passes.
    expect(isHorizontal(6, 0)).toBe(false)
    expect(isHorizontal(-6, 0)).toBe(false)
  })

  it('gives a diagonal to whichever direction is winning', () => {
    expect(isHorizontal(40, 12)).toBe(true)
    expect(isHorizontal(12, 40)).toBe(false)
  })

  it('treats a vertical drag as scrolling however far it goes', () => {
    expect(isHorizontal(4, 300)).toBe(false)
  })
})

describe('where the card sits', () => {
  it('tracks the thumb exactly up to the threshold', () => {
    expect(swipeOffset(40)).toBe(40)
    expect(swipeOffset(-40)).toBe(-40)
    expect(swipeOffset(SWIPE_THRESHOLD_PX)).toBe(SWIPE_THRESHOLD_PX)
  })

  it('damps everything past it, in both directions', () => {
    const far = swipeOffset(SWIPE_THRESHOLD_PX + 90)
    expect(far).toBeGreaterThan(SWIPE_THRESHOLD_PX)
    expect(far).toBeLessThan(SWIPE_THRESHOLD_PX + 90)
    expect(swipeOffset(-(SWIPE_THRESHOLD_PX + 90))).toBe(-far)
  })

  it('can never be flung off the screen', () => {
    for (const dx of [200, 600, 5000, -200, -5000]) {
      expect(Math.abs(swipeOffset(dx))).toBeLessThanOrEqual(SWIPE_MAX_PX)
    }
  })

  it('never moves the card the wrong way', () => {
    for (const dx of [1, 50, 300, -1, -50, -300]) {
      expect(Math.sign(swipeOffset(dx))).toBe(Math.sign(dx))
    }
  })
})

describe('how complete the gesture looks', () => {
  it('runs 0 to 1 across the threshold and stops there', () => {
    expect(swipeProgress(0)).toBe(0)
    expect(swipeProgress(SWIPE_THRESHOLD_PX / 2)).toBeCloseTo(0.5)
    expect(swipeProgress(SWIPE_THRESHOLD_PX)).toBe(1)
    expect(swipeProgress(1000)).toBe(1)
  })

  it('is the same in both directions', () => {
    expect(swipeProgress(-40)).toBe(swipeProgress(40))
  })
})
