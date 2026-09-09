// The evening card, and the three annoyances it must not become.

import { describe, expect, it } from 'vitest'
import { ROUNDUP_FROM_HOUR, shouldOfferRoundup } from '@/lib/domain/roundup'

describe('when the day round-up appears', () => {
  it('stays away when everything is already answered', () => {
    // Otherwise it is a congratulation nobody asked for, every evening.
    expect(shouldOfferRoundup('today', 22, 0)).toBe(false)
    expect(shouldOfferRoundup('past', 22, 0)).toBe(false)
  })

  it('waits until the evening on the current day', () => {
    expect(shouldOfferRoundup('today', ROUNDUP_FROM_HOUR - 1, 3)).toBe(false)
    expect(shouldOfferRoundup('today', ROUNDUP_FROM_HOUR, 3)).toBe(true)
    expect(shouldOfferRoundup('today', 23, 3)).toBe(true)
  })

  it('offers it at any hour on a day already past', () => {
    // Catching up is the whole reason the app lets somebody move across the
    // week, so the clock has no say on a day that is over.
    expect(shouldOfferRoundup('past', 6, 1)).toBe(true)
    expect(shouldOfferRoundup('past', 23, 1)).toBe(true)
  })

  it('never offers it for a day that has not happened', () => {
    // Answering ahead is guessing, and the adaptive engine would count the
    // guess as evidence.
    for (const hour of [0, 12, ROUNDUP_FROM_HOUR, 23]) {
      expect(shouldOfferRoundup('future', hour, 5)).toBe(false)
    }
  })
})
