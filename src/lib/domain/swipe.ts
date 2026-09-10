// Answering an action with a thumb.
//
// 74% of planned actions were never given a verdict, and everything the app
// claims to do rests on that verdict: no ratings, no patterns, no experiments,
// no rules. The adaptive engine was not broken, it was starved.
//
// The old path was a tap on the ring for "done" and a disclosure holding the
// other three answers. That is two taps and a decision for the answer people
// most need to give cheaply — "nicht geschafft" — on an evening when they are
// already not pleased about it. A swipe is one gesture, no aim, and it can be
// done without reading.
//
// The geometry lives here rather than in the component because it is the part
// with edge cases: how far is far enough, which direction wins when a thumb
// travels diagonally, and how the card behaves past the point of no return. A
// component can be looked at; this can be tested.

/** How far a card must travel before the gesture counts as an answer. */
export const SWIPE_THRESHOLD_PX = 72

/**
 * How far it may travel at all.
 *
 * Past this the card stops following the thumb. The resistance is the signal
 * that the answer is already decided — without it, a long drag looks like
 * something is still being chosen.
 */
export const SWIPE_MAX_PX = 108

export type SwipeVerdict = 'done' | 'missed' | null

/**
 * Which answer a finished gesture means, if any.
 *
 * Right is done, left is missed, and that is the way round it has to be:
 * right-and-forward is the direction every list in every app uses for the
 * affirmative, and a person who has to think about which way is which will use
 * the buttons instead.
 */
export function swipeVerdict(dx: number): SwipeVerdict {
  if (dx >= SWIPE_THRESHOLD_PX) return 'done'
  if (dx <= -SWIPE_THRESHOLD_PX) return 'missed'
  return null
}

/**
 * Whether this gesture is a swipe at all, or the start of a scroll.
 *
 * The screen scrolls vertically and the card answers horizontally, so every
 * touch is ambiguous for its first few pixels. Requiring the horizontal
 * component to be the larger one — and to have cleared a small dead zone —
 * keeps a scroll from nudging cards sideways all the way down the list, which
 * is the single most common way this gesture is got wrong.
 */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)
}

/**
 * Where the card sits while a thumb is on it.
 *
 * Linear up to the threshold, then heavily damped: the first 72 px track the
 * thumb exactly so the gesture feels direct, and everything after that moves a
 * third as far, so the card can never be flung off the screen and the
 * resistance says the answer is already given.
 */
export function swipeOffset(dx: number): number {
  const sign = dx < 0 ? -1 : 1
  const travel = Math.abs(dx)
  if (travel <= SWIPE_THRESHOLD_PX) return dx
  const past = travel - SWIPE_THRESHOLD_PX
  return sign * Math.min(SWIPE_MAX_PX, SWIPE_THRESHOLD_PX + past / 3)
}

/**
 * What a touch must not start on for the gesture to arm.
 *
 * The card is not a plain surface — it holds the completion ring, the "why"
 * disclosure and, once opened, four answer chips. A swipe handler on the whole
 * card competes with every one of them: a thumb that drifts eleven pixels
 * while tapping the ring locks the gesture, moves the card, and the browser
 * cancels the click. Eleven pixels is under the answer threshold, so nothing
 * is recorded either. The tap disappears with no error and no mark on screen.
 *
 * That is not a rare case. It is what tapping on a phone looks like.
 */
export const CONTROL_SELECTOR = 'button, a, input, textarea, select, summary, [role="button"]'

/**
 * Whether this touch began on something that is already a control.
 *
 * Written against the one method it needs rather than an Element, so the rule
 * can be tested without a DOM — the decision is the part worth holding still.
 */
export function startsOnControl(target: { closest(selector: string): unknown } | null): boolean {
  return target !== null && target.closest(CONTROL_SELECTOR) !== null
}

/** How complete the gesture looks, 0 to 1. Drives the backdrop's opacity. */
export function swipeProgress(dx: number): number {
  return Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD_PX)
}
