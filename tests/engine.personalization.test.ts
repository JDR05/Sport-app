// Different people, same goal.
//
// The original gate, now run once per archetype. Holding the goal fixed is what
// makes it honest: any difference has to come from the person, not from the goal
// type doing the work.
//
// The thresholds differ from the pre-correction ones because the metric changed
// — the signature now mixes shared structural features with archetype-specific
// ones, and within a fixed archetype the archetype key is constant by
// construction. New metric, new numbers, fixed before implementation.

import { describe, expect, it } from 'vitest'
import { generatePlan, planSignature, signatureDistance } from '@/lib/engine'
import { GOALS, PROFILES, makeInput } from './fixtures/profiles'

const MIN_MEAN_DISTANCE = 0.3
const MIN_PAIR_DISTANCE = 0.1

// general_health is baseline-only by design and carries almost no goal track,
// so it is measured separately with its own expectation.
const REAL_GOALS = GOALS.filter((g) => g.archetype !== 'general_health')

describe.each(REAL_GOALS)('goal "$name" across ten profiles', (goal) => {
  const signatures = PROFILES.map((profile) => ({
    name: profile.name,
    signature: planSignature(generatePlan(makeInput(profile, goal))),
  }))

  const pairs = signatures.flatMap((a, i) =>
    signatures.slice(i + 1).map((b) => ({
      label: `${a.name} ↔ ${b.name}`,
      distance: signatureDistance(a.signature, b.signature),
    })),
  )

  it('compares all 45 pairs', () => {
    expect(pairs).toHaveLength(45)
  })

  it('differs by at least the mean threshold', () => {
    const mean = pairs.reduce((sum, p) => sum + p.distance, 0) / pairs.length
    expect(mean).toBeGreaterThanOrEqual(MIN_MEAN_DISTANCE)
  })

  it('gives no two people a near identical plan', () => {
    const closest = pairs.reduce((min, p) => (p.distance < min.distance ? p : min))
    expect(
      closest.distance,
      `closest pair was ${closest.label} at ${closest.distance.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(MIN_PAIR_DISTANCE)
  })
})
