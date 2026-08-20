// Time that is already spent.
//
// The engine used to know only about time the person offered. Everything else
// looked like an empty week, which produced two specific kinds of nonsense:
// a session planned into an hour that was never free, and — the one the
// product owner ran into — a second training session on the evening someone
// already has football.
//
// A commitment is therefore two facts at once. It removes time, and when it is
// sport it also *supplies* training. Both have to be read, or the plan either
// double-books the person or quietly ignores the biggest part of their week.
//
// Pure interval arithmetic, no dates: a commitment recurs weekly, so the only
// thing that matters is the weekday and the minutes it occupies.

import { MIN_VIABLE_SESSION_MINUTES } from './constants'
import type { Commitment, FreeSlot, Weekday } from '@/lib/domain/types'

/** 'HH:MM' as minutes since midnight. Malformed input yields NaN-free 0. */
export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map((n) => Number.parseInt(n, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

function timeOfMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type Interval = { from: number; to: number }

function intervalOf(item: { start: string; minutes: number }): Interval {
  const from = minutesOfDay(item.start)
  return { from, to: from + Math.max(0, item.minutes) }
}

/**
 * What is left of one free slot once a commitment is taken out of it.
 *
 * A commitment in the middle of a long slot leaves two pieces, and both are
 * kept: someone free 16:00–22:00 with training 19:00–21:00 really does have an
 * hour before and an hour after. Dropping the whole slot would have thrown away
 * usable time and made the week look emptier than it is.
 *
 * Pieces shorter than a viable session are discarded — a fourteen-minute gap is
 * not a training window, and offering it as one is how a plan stops being
 * believable.
 */
function subtractOne(slot: FreeSlot, busy: Interval[]): FreeSlot[] {
  let pieces: Interval[] = [intervalOf(slot)]

  for (const block of busy) {
    const next: Interval[] = []
    for (const piece of pieces) {
      if (block.to <= piece.from || block.from >= piece.to) {
        next.push(piece)
        continue
      }
      if (block.from > piece.from) next.push({ from: piece.from, to: block.from })
      if (block.to < piece.to) next.push({ from: block.to, to: piece.to })
    }
    pieces = next
  }

  return pieces
    .filter((p) => p.to - p.from >= MIN_VIABLE_SESSION_MINUTES)
    .map((p) => ({ weekday: slot.weekday, start: timeOfMinutes(p.from), minutes: p.to - p.from }))
}

/** The week's free time with every commitment removed from it. */
export function freeSlotsMinusCommitments(
  slots: FreeSlot[],
  commitments: Commitment[],
): FreeSlot[] {
  if (commitments.length === 0) return slots

  return slots.flatMap((slot) =>
    subtractOne(
      slot,
      commitments.filter((c) => c.weekday === slot.weekday).map(intervalOf),
    ),
  )
}

/** Days that already carry sport. No second session is planned onto these. */
export function sportDays(commitments: Commitment[]): Weekday[] {
  const days = new Set<Weekday>()
  for (const c of commitments) {
    if (c.kind === 'sport') days.add(c.weekday)
  }
  return [...days]
}

/**
 * How many training sessions the week already contains without the app
 * planning any. Counted per day rather than per entry: two football slots on
 * the same evening are one training day, and the rest-day rules count days.
 */
export function sportSessionsPerWeek(commitments: Commitment[]): number {
  return sportDays(commitments).length
}

/** The commitments on one day, longest first, for a sentence the user can check. */
export function commitmentsOn(commitments: Commitment[], day: Weekday): Commitment[] {
  return commitments
    .filter((c) => c.weekday === day)
    .sort((a, b) => b.minutes - a.minutes)
}

