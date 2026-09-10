// What the model is allowed to do to a day.
//
// This is the first AI output in the product that changes data rather than
// producing text, so the interesting tests are not the happy path. They are the
// six ways an adjustment is refused, and they matter in different weights:
//
//   * `unknown_item` is the security-shaped one. Without it a model — or
//     anything that can make a model say a string — names an id and the app
//     writes to it. RLS still scopes the write to this person, so the worst
//     case is one of their own rows rather than somebody else's, but "the row
//     the model named" is not a row anybody chose.
//   * `already_resolved` is the race. The card is drawn, they tick the action
//     off, they tap the card. Without this the tap rewrites the slot of
//     something already done.
//   * `would_empty_goal_track` is the product one, and the one worth arguing
//     with. It is written out in dayBrief.ts.

import { describe, expect, it } from 'vitest'
import { adjustLabel, applicable, type Adjust, type DayAction } from '@/lib/domain/dayBrief'
import type { TimeSlot } from '@/lib/domain/types'

const goalEvening: DayAction = { id: 'g1', status: 'unknown', track: 'goal', slot: 'evening' }
const goalMidday: DayAction = { id: 'g2', status: 'unknown', track: 'goal', slot: 'midday' }
const baseEarly: DayAction = { id: 'b1', status: 'unknown', track: 'baseline', slot: 'early' }

const ALL_SLOTS: TimeSlot[] = ['early', 'midday', 'evening']

const move = (over: Partial<Adjust> = {}): Adjust => ({
  itemId: 'g1',
  kind: 'move',
  toSlot: 'midday',
  reason: 'Abends ist diese Woche zweimal nichts daraus geworden.',
  ...over,
})

const drop = (over: Partial<Adjust> = {}): Adjust => ({
  itemId: 'g1',
  kind: 'drop',
  toSlot: null,
  reason: 'Du hast dreimal zu wenig geschlafen und heute steht schon das Vereinstraining an.',
  ...over,
})

describe('an adjustment the day does not support', () => {
  it('refuses an id that is not on today', () => {
    const verdict = applicable(move({ itemId: 'nope' }), [goalEvening, goalMidday], ALL_SLOTS)
    expect(verdict).toEqual({ ok: false, refusal: 'unknown_item' })
  })

  it.each(['done', 'missed', 'not_relevant', 'moved'])(
    'refuses to touch an action that is already %s',
    (status) => {
      const day = [{ ...goalEvening, status }, goalMidday]
      expect(applicable(move(), day, ALL_SLOTS)).toEqual({
        ok: false,
        refusal: 'already_resolved',
      })
    },
  )

  it('refuses a move with no destination rather than reading it as a drop', () => {
    // The schema permits a null slot because a drop carries none. That
    // ambiguity must not be resolved by guessing: moving somebody's session
    // and removing it are different things to do to their day.
    expect(applicable(move({ toSlot: null }), [goalEvening, goalMidday], ALL_SLOTS)).toEqual({
      ok: false,
      refusal: 'no_slot',
    })
  })

  it('refuses a move into a part of the day this person does not have', () => {
    // They said their free time today is the evening. "Verschieb es auf
    // mittags" is a suggestion to train during their working hours.
    expect(applicable(move(), [goalEvening, goalMidday], ['evening'])).toEqual({
      ok: false,
      refusal: 'slot_unavailable',
    })
  })

  it('refuses a move to where it already is', () => {
    expect(applicable(move({ toSlot: 'evening' }), [goalEvening, goalMidday], ALL_SLOTS)).toEqual({
      ok: false,
      refusal: 'same_slot',
    })
  })

  it('refuses to drop the last open action of the goal track', () => {
    // Dropping is a safe direction for load, so nothing physical goes wrong.
    // What goes wrong is the promise: repeated on a few bad days, the goal
    // quietly stops being planned for and nobody decided that.
    expect(applicable(drop(), [goalEvening, baseEarly], ALL_SLOTS)).toEqual({
      ok: false,
      refusal: 'would_empty_goal_track',
    })
  })
})

describe('an adjustment the day does support', () => {
  it('allows a move into a free slot that is not the current one', () => {
    expect(applicable(move(), [goalEvening, goalMidday], ALL_SLOTS)).toEqual({ ok: true })
  })

  it('allows a move for an action that has no slot yet', () => {
    const unslotted = { ...goalEvening, slot: null }
    expect(applicable(move(), [unslotted, goalMidday], ALL_SLOTS)).toEqual({ ok: true })
  })

  it('allows dropping a goal action while another goal action is still open', () => {
    expect(applicable(drop(), [goalEvening, goalMidday], ALL_SLOTS)).toEqual({ ok: true })
  })

  it('allows dropping the last baseline action — the limit is about the goal', () => {
    // The health baseline runs under every goal, and a day is allowed to lose
    // its walk. It is the goal track that must not silently empty out.
    expect(applicable(drop({ itemId: 'b1' }), [goalEvening, baseEarly], ALL_SLOTS)).toEqual({
      ok: true,
    })
  })

  it('counts only *open* goal actions when deciding whether the track would empty', () => {
    // Two goal actions, one already done. Dropping the other leaves the day
    // with nothing left to do for the goal, which is the case the rule is for —
    // a finished action is not something still standing between them and an
    // empty day.
    const day: DayAction[] = [goalEvening, { ...goalMidday, status: 'done' }]
    expect(applicable(drop(), day, ALL_SLOTS)).toEqual({
      ok: false,
      refusal: 'would_empty_goal_track',
    })
  })
})

describe('what the button says', () => {
  // The app's words, not the model's. It is a statement about what the tap
  // does, and a model that could phrase it could phrase it into something the
  // tap does not do.
  it('names the destination for a move', () => {
    expect(adjustLabel(move({ toSlot: 'early' }))).toBe('Auf morgens verschieben')
    expect(adjustLabel(move({ toSlot: 'midday' }))).toBe('Auf mittags verschieben')
    expect(adjustLabel(move({ toSlot: 'evening' }))).toBe('Auf abends verschieben')
  })

  it('says what a drop does, without the word "löschen"', () => {
    // The row survives — the status becomes not_relevant — so the label must
    // not promise a deletion the app does not perform.
    expect(adjustLabel(drop())).toBe('Heute streichen')
    expect(adjustLabel(drop())).not.toMatch(/l(ö|oe)sch/i)
  })
})
