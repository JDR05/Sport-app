// What the app knows about this week, as one value.
//
// It used to be two booleans in the provider, and the gaps between them were
// blank screens. `no_goal` set `loaded` without ever setting a week, so the
// guard fell through to `return null`; a request that threw never reached the
// handler at all, so `loaded` stayed false for ever. From the sofa both look
// the same — the app opens to nothing and stays there, with no way to tell
// whether it is thinking, broken, or waiting on something.
//
// Kept apart from the provider so the mapping can be tested without a browser,
// and so the union is somewhere a screen can be checked against exhaustively.
// A state nobody renders is a state nobody notices is broken.

import type { WeekResult } from '@/lib/db/week-plan'

export type PlanState =
  /** The clock is unknown or the week is still in flight. */
  | 'loading'
  | 'ready'
  /** A safety invariant refused the plan. Shown, never swallowed. */
  | 'unsafe'
  /** No active goal — the onboarding was never finished, or the goal was retired. */
  | 'no_goal'
  /** The request itself failed. Nothing is known, and retrying is reasonable. */
  | 'failed'

/** Every answer the server can give, mapped to something the guard renders. */
export function planStateOf(result: WeekResult): PlanState {
  if (result.ok) return 'ready'
  return result.reason === 'unsafe' ? 'unsafe' : 'no_goal'
}
