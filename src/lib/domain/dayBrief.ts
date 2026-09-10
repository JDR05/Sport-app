// What the model is allowed to do to a day.
//
// Pure, so the whole gate can be tested without a database, a model or a
// screen — and it is the half of this feature that has to be right. The model
// proposes; this decides whether the proposal may exist at all; the person
// taps; code writes. Nothing in that chain trusts the step before it.
//
// The rule behind every check here is the one from CLAUDE.md: the AI may
// judge, the code holds the limits. So the questions this file answers are all
// the same question in different shapes — *could this change make the day
// heavier, or touch something that is not this person's to touch?*

import type { TimeSlot } from './types'

/** An action as this gate needs to see it. Deliberately less than a PlannedItem. */
export type DayAction = {
  id: string
  /** Only an untouched action may be adjusted. See `applicable`. */
  status: string
  track: string
  slot: TimeSlot | null
}

/** The proposal, in the shape the schema produced it. */
export type Adjust = {
  itemId: string
  kind: 'move' | 'drop'
  toSlot: TimeSlot | null
  reason: string
}

export type Refusal =
  /** The id is not one of today's rows — invented, stale, or somebody else's. */
  | 'unknown_item'
  /** Already done, missed or set aside. Rewriting history is not adjusting a day. */
  | 'already_resolved'
  /** A move needs a destination. */
  | 'no_slot'
  /** Moving it there would put it in a slot this person does not have. */
  | 'slot_unavailable'
  /** It is already there. A no-op offered as a change is noise. */
  | 'same_slot'
  /** The last open action of the goal track. See below. */
  | 'would_empty_goal_track'

export type Verdict = { ok: true } | { ok: false; refusal: Refusal }

/**
 * Whether an adjustment may be offered and, later, applied.
 *
 * Called twice on purpose: once before the card is shown, so a proposal that
 * cannot be applied never appears as a button, and once again at the moment
 * the person taps it, because the day moves between those two points. They
 * tick the action off, then tap "verschieben" on a card rendered a minute ago —
 * without the second call that writes a slot change onto a finished action.
 *
 * `would_empty_goal_track` is the only check here that is about the product
 * rather than about safety, and it is the one worth arguing with. Dropping is
 * a safe direction for load, so nothing physical goes wrong. What goes wrong is
 * the promise: a person opens the app on a bad day, the model offers to take
 * the last goal action out of it, they tap, and the day now contains only the
 * health baseline. Repeated on a few bad days, the goal quietly stops being
 * planned for and nobody decided that. Taking an action out when another one
 * remains is adapting; taking the last one out is abandoning, and abandoning
 * is not a thing a card should do in one tap.
 */
export function applicable(
  adjust: Adjust,
  today: DayAction[],
  availableSlots: readonly TimeSlot[],
): Verdict {
  const item = today.find((a) => a.id === adjust.itemId)
  if (!item) return { ok: false, refusal: 'unknown_item' }
  if (item.status !== 'unknown') return { ok: false, refusal: 'already_resolved' }

  if (adjust.kind === 'drop') {
    const openGoalActions = today.filter((a) => a.track === 'goal' && a.status === 'unknown')
    if (item.track === 'goal' && openGoalActions.length <= 1) {
      return { ok: false, refusal: 'would_empty_goal_track' }
    }
    return { ok: true }
  }

  if (adjust.toSlot === null) return { ok: false, refusal: 'no_slot' }
  if (!availableSlots.includes(adjust.toSlot)) return { ok: false, refusal: 'slot_unavailable' }
  if (item.slot === adjust.toSlot) return { ok: false, refusal: 'same_slot' }
  return { ok: true }
}

/**
 * What the button says.
 *
 * In the app's own words rather than the model's, because this is the label on
 * the thing that changes data. The model writes the *reason*; the app writes
 * what will happen. A model that could word its own button could word it into
 * something the tap does not do.
 */
export function adjustLabel(adjust: Adjust): string {
  if (adjust.kind === 'drop') return 'Heute streichen'
  return `Auf ${SLOT_LABEL[adjust.toSlot ?? 'midday']} verschieben`
}

const SLOT_LABEL: Record<TimeSlot, string> = {
  early: 'morgens',
  midday: 'mittags',
  evening: 'abends',
}
