// Schritt 2 of the cycle: turn a pattern into a guess at a changeable cause.
//
// The constraint that shapes this whole module: a hypothesis must name
// something the plan can alter. "You are unmotivated" is a verdict, not a
// hypothesis — no experiment follows from it, and the user cannot act on it.
// So every branch here produces a `variable` that maps to exactly one rule the
// planner understands, or produces nothing at all.

import { LONG_SESSION_MINUTES } from './constants'
import type { Deviation, Hypothesis, Observation } from './types'
import { WEEKDAY_LABELS, DOMAIN_LABELS, SLOT_LABELS } from './labels'
import type { TimeSlot, Weekday } from '@/lib/domain/types'

/**
 * The single change an experiment would make. One deviation, one variable —
 * moving the day *and* shortening the session at the same time makes the
 * result uninterpretable.
 */
type Candidate = {
  variable: string
  statement: string
  ruleKey: string
  ruleValue: Record<string, unknown>
}

export function formHypothesis(
  deviation: Deviation,
  observations: Observation[] = [],
): Hypothesis | null {
  const candidate = candidateFor(deviation, observations)
  if (!candidate) return null
  return {
    deviation,
    statement: candidate.statement,
    variable: candidate.variable,
  }
}

/** The rule an accepted experiment on this hypothesis would write. */
export function proposedRuleFor(
  deviation: Deviation,
  observations: Observation[] = [],
): { ruleKey: string; ruleValue: Record<string, unknown> } | null {
  const candidate = candidateFor(deviation, observations)
  return candidate ? { ruleKey: candidate.ruleKey, ruleValue: candidate.ruleValue } : null
}

function candidateFor(deviation: Deviation, observations: Observation[]): Candidate | null {
  switch (deviation.dimension) {
    case 'weekday':
      return weekdayCandidate(deviation)
    case 'time_slot':
      return timeSlotCandidate(deviation, observations)
    case 'duration':
      return durationCandidate(deviation)
    case 'domain':
      return domainCandidate(deviation)
  }
}

function weekdayCandidate(deviation: Deviation): Candidate {
  const day = WEEKDAY_LABELS[deviation.bucket as Weekday] ?? deviation.bucket
  return {
    variable: 'weekday',
    // Names the collision, not the person. The plan is what is wrong here.
    statement: `${day} kollidiert regelmäßig mit deinem Alltag — an anderen Tagen setzt du den Plan deutlich häufiger um.`,
    ruleKey: 'avoid_weekday',
    ruleValue: { weekday: deviation.bucket },
  }
}

/**
 * Only worth proposing if there is a demonstrably better slot to move to.
 * Without one, "try another time of day" is advice, not an experiment.
 */
function timeSlotCandidate(deviation: Deviation, observations: Observation[]): Candidate | null {
  const better = bestOtherSlot(deviation.bucket, observations)
  if (!better) return null

  const from = SLOT_LABELS[deviation.bucket as TimeSlot] ?? deviation.bucket
  const to = SLOT_LABELS[better]
  return {
    variable: 'time_slot',
    statement: `${from} bleibt bei dir häufig liegen; ${to} funktioniert bisher zuverlässiger.`,
    ruleKey: 'prefer_time_slot',
    ruleValue: { slot: better },
  }
}

/**
 * Long sessions being skipped is a size problem with an obvious lever. Short
 * ones being skipped is not — the cause is somewhere this axis cannot see, and
 * inventing one would be worse than staying quiet.
 */
function durationCandidate(deviation: Deviation): Candidate | null {
  if (deviation.bucket !== 'long') return null
  return {
    variable: 'session_length',
    statement: `Einheiten ab ${LONG_SESSION_MINUTES} Minuten passen selten in deinen Tag — kürzere gehen bei dir häufiger auf.`,
    ruleKey: 'shorter_sessions',
    ruleValue: { maxMinutes: 30 },
  }
}

function domainCandidate(deviation: Deviation): Candidate {
  const label = DOMAIN_LABELS[deviation.domain ?? 'movement'] ?? deviation.bucket
  return {
    variable: 'domain_load',
    statement: `Der Bereich ${label} ist so, wie er geplant ist, zu aufwendig — die anderen Bereiche laufen bei dir.`,
    ruleKey: 'lighter_domain',
    ruleValue: { domain: deviation.bucket },
  }
}

function bestOtherSlot(exclude: string, observations: Observation[]): TimeSlot | null {
  const slots: TimeSlot[] = ['early', 'midday', 'evening']
  let best: TimeSlot | null = null
  let bestRate = 0

  for (const slot of slots) {
    if (slot === exclude) continue
    const inSlot = observations.filter(
      (o) => o.timeSlot === slot && (o.status === 'done' || o.status === 'moved' || o.status === 'missed'),
    )
    if (inSlot.length === 0) continue
    const rate = inSlot.filter((o) => o.status !== 'missed').length / inSlot.length
    if (rate > bestRate) {
      bestRate = rate
      best = slot
    }
  }

  return best
}
