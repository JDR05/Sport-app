// Why the daily calorie target is the number it is.
//
// On a real account it went 2548 -> 2891 -> 3019 -> 3194 kcal across three
// weeks. Every one of those was computed correctly — the person was heavier,
// so the daily need was higher, and the deadline was nearer, so the same
// distance had less time. The defect was the silence. This is the number
// somebody arranges their day around, and one that moves on its own is one
// people stop trusting rather than one they ask about.

import { describe, expect, it } from 'vitest'
import { generatePlan } from '@/lib/engine'
import { GOALS, makeInput, PROFILES } from './fixtures/profiles'

describe('the calorie target says where it came from', () => {
  // On a real account this number went 2548 -> 2891 -> 3019 -> 3194 kcal over
  // three weeks. The arithmetic was right every time — heavier person, nearer
  // deadline — and the app never mentioned it. A figure somebody arranges
  // their day around, moving on its own, is one people stop trusting rather
  // than one they ask about.
  const input = { ...makeInput(PROFILES[0], GOALS[0]), today: '2026-08-17' }

  it('names the need, the delta and the rate behind the number', () => {
    const plan = generatePlan(input)
    const line = plan.rationale.find((r) => r.text.includes('kcal am Tag'))
    expect(line).toBeDefined()
    expect(line?.text).toMatch(/\d+ kcal Bedarf/)
    expect(line?.text).toMatch(/kg pro Woche/)
  })

  it('says what would move it', () => {
    const plan = generatePlan(input)
    const line = plan.rationale.find((r) => r.text.includes('kcal am Tag'))
    expect(line?.text).toMatch(/Gewicht|Zieldatum/)
  })

  it('cites the fields it was computed from', () => {
    const plan = generatePlan(input)
    const line = plan.rationale.find((r) => r.text.includes('kcal am Tag'))
    expect(line?.basedOn).toContain('metrics.weight_kg')
    expect(line?.basedOn).toContain('goal.targetDate')
  })
})
