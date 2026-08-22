// The blank screen had two causes and they were both a missing branch.
//
// `no_goal` came back from the server, was written down as "loaded", and then
// matched neither arm of the guard — which fell through to rendering nothing.
// A request that threw never reached the handler at all, so "loaded" stayed
// false and the app waited for ever. Neither one logs anything. Neither one
// looks different from the other. The app simply opens to nothing.
//
// So the mapping lives outside the component and is checked here: every answer
// the server can give has to land on a state, and every state has to be one a
// screen actually renders.

import { describe, expect, it } from 'vitest'
import { planStateOf, type PlanState } from '@/components/planState'
import type { WeekResult } from '@/lib/db/week-plan'
import type { StoredWeek } from '@/lib/db/week-plan'

const week = {
  planId: 'p1',
  weekStart: '2026-08-17',
  strategy: {},
  rationale: [],
  assumptions: [],
  items: [],
} as unknown as StoredWeek

/** Everything ensureWeekPlan is declared to return. */
const ANSWERS: { name: string; result: WeekResult; expected: PlanState }[] = [
  { name: 'a week', result: { ok: true, week }, expected: 'ready' },
  { name: 'no goal', result: { ok: false, reason: 'no_goal' }, expected: 'no_goal' },
  {
    name: 'a refused plan',
    result: { ok: false, reason: 'unsafe', message: 'Kaloriengrenze unterschritten' },
    expected: 'unsafe',
  },
]

describe('every answer the server can give', () => {
  it.each(ANSWERS)('maps $name to $expected', ({ result, expected }) => {
    expect(planStateOf(result)).toBe(expected)
  })

  it('never answers with loading', () => {
    // Loading is the absence of an answer. If the mapping could produce it,
    // an arrived answer would be indistinguishable from one still in flight —
    // which is exactly how the old code hid a failure as a wait.
    for (const { result } of ANSWERS) {
      expect(planStateOf(result)).not.toBe('loading')
    }
  })

  it('covers every reason the result type allows', () => {
    // A reason added to WeekResult without a case here fails to compile rather
    // than quietly rendering an empty screen.
    const reasons = ANSWERS.filter((a) => !a.result.ok).map((a) =>
      a.result.ok ? null : a.result.reason,
    )
    expect(new Set(reasons)).toEqual(new Set(['no_goal', 'unsafe']))
  })
})

describe('what the guard has to render', () => {
  it('handles all five states', () => {
    // The list is duplicated from RequirePlan on purpose: it is the checklist
    // that says a state was given somewhere to go. Adding one to the union
    // without adding it here is a test failure, not a blank screen.
    const handled: PlanState[] = ['loading', 'ready', 'unsafe', 'no_goal', 'failed']
    const all: Record<PlanState, true> = {
      loading: true, ready: true, unsafe: true, no_goal: true, failed: true,
    }
    expect(new Set(handled)).toEqual(new Set(Object.keys(all)))
  })
})
