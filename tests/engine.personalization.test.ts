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

// The fallback archetype is measured separately, at the bottom of this file,
// because its floor is genuinely lower — see the reasoning there. The comment
// that used to sit here claimed that separate measurement already existed. It
// did not: general_health was excluded and then never checked at all, and two
// profiles were quietly producing byte-identical plans.
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

describe('the fallback goal', () => {
  // general_health is what someone gets when their goal matched no archetype.
  // Deterministically it is the health basis plus one starting point chosen
  // from the profile, so two people whose basis and weakest area coincide
  // really do get the same week — and saying so is more honest than gating a
  // minimum this archetype cannot meet without inventing differences.
  //
  // The mean is gated, because "everyone gets the same fallback" is still a
  // product failure. ADR-041 puts the rest of the answer on the AI, which takes
  // over exactly here.
  const MIN_FALLBACK_MEAN = 0.25

  const goal = GOALS.find((g) => g.archetype === 'general_health')!
  const signatures = PROFILES.map((profile) =>
    planSignature(generatePlan(makeInput(profile, goal))),
  )
  const pairs = signatures.flatMap((a, i) =>
    signatures.slice(i + 1).map((b) => signatureDistance(a, b)),
  )

  it('differs across people more than a fixed template would', () => {
    const mean = pairs.reduce((sum, d) => sum + d, 0) / pairs.length
    expect(mean).toBeGreaterThanOrEqual(MIN_FALLBACK_MEAN)
  })

  it('picks a starting point from the person, not a constant', () => {
    // Before this existed, every profile got the same single "Ziel schärfen"
    // action and the whole archetype had one plan.
    const starts = PROFILES.map((p) => {
      const plan = generatePlan(makeInput(p, goal))
      return plan.items.find((i) => i.details?.kind === 'starting_point')?.details.focus
    })
    expect(starts.every((s) => typeof s === 'string')).toBe(true)
    expect(new Set(starts).size).toBeGreaterThanOrEqual(3)
  })
})
