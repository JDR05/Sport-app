// The gate the course correction exists for.
//
// Same person, different goals. If someone with an identical daily routine gets
// a similar plan whether they said "abnehmen" or "besser schlafen", then the app
// is not goal-oriented — it just claims to be. See docs/GOAL_ARCHETYPES.md.
//
// Thresholds fixed before the archetypes were implemented (ADR-014). If this
// fails, the archetypes get fixed, not the numbers.

import { describe, expect, it } from 'vitest'
import { generatePlan, planSignature, signatureDistance } from '@/lib/engine'
import { GOALS, PROFILES, makeInput } from './fixtures/profiles'

const MIN_MEAN_DISTANCE = 0.6
const MIN_PAIR_DISTANCE = 0.3

describe.each(PROFILES)('$name with every goal', (profile) => {
  const signatures = GOALS.map((goal) => ({
    name: goal.name,
    archetype: goal.archetype,
    signature: planSignature(generatePlan(makeInput(profile, goal))),
  }))

  const pairs = signatures.flatMap((a, i) =>
    signatures.slice(i + 1).map((b) => ({
      label: `${a.name} ↔ ${b.name}`,
      distance: signatureDistance(a.signature, b.signature),
    })),
  )

  it('produces a plan for all seven archetypes', () => {
    expect(signatures).toHaveLength(7)
  })

  it('gives every goal a structurally different plan', () => {
    const mean = pairs.reduce((sum, p) => sum + p.distance, 0) / pairs.length
    expect(mean).toBeGreaterThanOrEqual(MIN_MEAN_DISTANCE)
  })

  it('never gives two different goals near identical plans', () => {
    const closest = pairs.reduce((min, p) => (p.distance < min.distance ? p : min))
    expect(
      closest.distance,
      `closest pair was ${closest.label} at ${closest.distance.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(MIN_PAIR_DISTANCE)
  })

  it('reaches a different set of domains depending on the goal', () => {
    // The sharpest signal that the goal actually drove the plan: a sleep goal
    // must touch the sleep domain, a habit goal self_improvement.
    const domainsByGoal = new Map(signatures.map((s) => [s.archetype, s.signature.domains]))
    expect(domainsByGoal.get('sleep_recovery')).toContain('sleep')
    expect(domainsByGoal.get('habit_routine')).toContain('self_improvement')
    expect(domainsByGoal.get('endurance')).toContain('training')
  })
})
