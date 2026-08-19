// The most important quality gate in the whole project.
//
// The playbook puts it plainly: if ten strongly different profiles get roughly
// the same plan, the personalisation is not real. Both thresholds below were
// fixed in the plan BEFORE the engine was written (ADR-014). If a change to the
// engine makes this fail, the engine is what gets fixed.

import { describe, expect, it } from 'vitest'
import { generatePlan, planSignature, signatureDistance } from '@/lib/engine'
import { SIGNATURE_FEATURES } from '@/lib/engine/signature'
import { ALL_PROFILES } from './fixtures/profiles'

/** Fixed in advance. Do not relax these to make a failing run pass. */
const MIN_MEAN_DISTANCE = 0.45
const MIN_PAIR_DISTANCE = 0.2

const signatures = ALL_PROFILES.map((p) => ({
  name: p.name,
  signature: planSignature(generatePlan(p.input)),
}))

const pairs = signatures.flatMap((a, i) =>
  signatures.slice(i + 1).map((b) => ({
    label: `${a.name} ↔ ${b.name}`,
    distance: signatureDistance(a.signature, b.signature),
  })),
)

describe('structural personalisation', () => {
  it('compares all 45 pairs of the ten profiles', () => {
    expect(signatures).toHaveLength(10)
    expect(pairs).toHaveLength(45)
  })

  it('differs by at least the mean threshold across all pairs', () => {
    const mean = pairs.reduce((sum, p) => sum + p.distance, 0) / pairs.length
    expect(mean).toBeGreaterThanOrEqual(MIN_MEAN_DISTANCE)
  })

  it('gives no two profiles a near identical plan', () => {
    const closest = pairs.reduce((min, p) => (p.distance < min.distance ? p : min))
    expect(
      closest.distance,
      `closest pair was ${closest.label} at ${closest.distance.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(MIN_PAIR_DISTANCE)
  })

  it('has no pair of identical signatures', () => {
    for (const pair of pairs) {
      expect(pair.distance, pair.label).toBeGreaterThan(0)
    }
  })

  it('exercises every signature feature at least twice', () => {
    // A feature that is constant across all ten profiles contributes nothing and
    // would quietly inflate the apparent robustness of the gate.
    for (const feature of SIGNATURE_FEATURES) {
      const distinct = new Set(signatures.map((s) => s.signature[feature]))
      expect(distinct.size, `feature "${feature}" never varies`).toBeGreaterThanOrEqual(2)
    }
  })
})
