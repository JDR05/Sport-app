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
import type {
  Activity, Commitment, CommitmentInsight, FreeSlot, Weekday,
} from '@/lib/domain/types'

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
 * Pieces shorter than `floor` are discarded — a fourteen-minute gap is not a
 * training window, and offering it as one is how a plan stops being believable.
 * The floor is a parameter because it is not the same number for a session and
 * for five minutes of breathing.
 */
function subtractOne(slot: FreeSlot, busy: Interval[], floor: number): FreeSlot[] {
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
    .filter((p) => p.to - p.from >= floor)
    .map((p) => ({ weekday: slot.weekday, start: timeOfMinutes(p.from), minutes: p.to - p.from }))
}

/**
 * The week's free time with every commitment removed from it.
 *
 * `floor` is what a remaining piece has to be worth keeping, and it is a
 * parameter because there are two honest answers. For a session it is twenty
 * minutes: a quarter of an hour between football and bed is not a workout. For
 * a five-minute breathing exercise it is five, and applying the session's floor
 * there is what made the app refuse to put anything at all on the evening
 * somebody plays football.
 */
export function freeSlotsMinusCommitments(
  slots: FreeSlot[],
  commitments: Commitment[],
  floor: number = MIN_VIABLE_SESSION_MINUTES,
): FreeSlot[] {
  if (commitments.length === 0) return slots

  return slots.flatMap((slot) =>
    subtractOne(
      slot,
      commitments.filter((c) => c.weekday === slot.weekday).map(intervalOf),
      floor,
    ),
  )
}

/**
 * Sport the person already does that is the *same kind of work* the goal needs.
 *
 * The distinction this draws is the one the engine was missing entirely.
 * Football is training: it costs recovery, it fills an evening, and it counts
 * against the rest days. It is not gym work, and it is not a structured run.
 * Treating it as a substitute for either meant somebody who plays twice a week
 * had their strength plan cut from three sessions to one — while their week
 * still had three free evenings in it.
 *
 * "Ich hab ja dann trotzdem an anderen Tagen noch Zeit für Krafttraining."
 *
 * So load is counted from every sport day (`sportDays`), and the goal's own
 * work only from the activities that actually do it.
 */
export function goalSessions(
  commitments: Commitment[],
  counts: readonly Activity[] | undefined,
  /**
   * The model's judgement, per commitment label. Where it exists it decides,
   * because whether somebody's swimming is endurance work *for this goal* is
   * an assessment and not a property of the word "swimming".
   */
  insights?: CommitmentInsight[] | null,
): number {
  // No list means "any sport does this job" — the old behaviour, kept for any
  // archetype that has not thought about it.
  if (!counts && !insights) return sportSessionsPerWeek(commitments)

  const judged = new Map((insights ?? []).map((i) => [i.label, i.doesGoalWork]))

  const days = new Set<Weekday>()
  for (const c of commitments) {
    if (c.kind !== 'sport') continue

    // The judgement first, the table second. That order is the whole point:
    // the table is what an account with no model gets, not what everybody gets.
    const judgement = judged.get(c.label)
    const doesTheWork =
      judgement !== undefined
        ? judgement
        : counts
          ? c.activity !== null && counts.includes(c.activity)
          : true

    if (doesTheWork) days.add(c.weekday)
  }
  return days.size
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

