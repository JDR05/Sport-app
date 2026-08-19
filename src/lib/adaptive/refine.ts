// Plan care — the fast half of the two-tier loop.
//
// It exists for one reason: without it, nothing visibly happens in week one,
// because the statistical threshold has not been reached and cannot be. The
// user would conclude the app is not paying attention, and they would be right
// to.
//
// So plan care runs from day two, deterministically, and it is honest about
// what it is: `provisional: true` on every patch. It moves things and it drops
// things the plan got wrong. What it never does is write a personal rule —
// that is ADR-013, and it is the reason this module returns a PlanPatch with
// no rule field rather than something the caller has to remember to ignore.

import type { Observation, PlanPatch } from './types'
import { planningErrors } from './detect'
import { addDays, weekdayOf } from '@/lib/engine/dates'
import { WEEKDAYS, type Weekday } from '@/lib/domain/types'
import { DOMAIN_LABELS, WEEKDAY_LABELS } from './labels'

/**
 * @param observations everything planned so far this week and what became of it
 * @param today ISO date; nothing before it is touched, the past cannot be replanned
 */
export function refinePlan(observations: Observation[], today: string): PlanPatch {
  const patch: PlanPatch = { moves: [], removals: [], provisional: true, notes: [] }

  // ------------------------------------------------- planning errors ----
  // `not_relevant` means the plan asked for something that does not apply to
  // this person's life. That is the plan being wrong, so it is corrected
  // quietly — it is never counted as a miss and never becomes a pattern.
  for (const wrong of planningErrors(observations)) {
    patch.removals.push({
      itemId: wrong.itemId,
      reason:
        `„${wrong.title}" passt nicht zu deinem Alltag. Die Aktion fällt aus dem Plan — ` +
        `sie zählt nicht als verpasst.`,
    })
  }

  // ------------------------------------------------------- single miss --
  // One missed action is not a pattern and must not be treated as one. It is
  // still worth offering the day back, which is a scheduling courtesy rather
  // than a claim about the person.
  const missedPast = observations.filter((o) => o.status === 'missed' && o.scheduledOn < today)
  for (const item of missedPast) {
    const target = nextFreeDate(today, observations)
    if (target === null) continue
    patch.moves.push({
      itemId: item.itemId,
      fromDate: item.scheduledOn,
      toDate: target,
      reason:
        `${WEEKDAY_LABELS[weekdayOf(item.scheduledOn)]} hat nicht geklappt. ` +
        `Vorschlag: ${WEEKDAY_LABELS[weekdayOf(target)]}. Vorläufig — ein einzelner ` +
        `Ausfall sagt noch nichts.`,
    })
  }

  if (patch.moves.length > 0 || patch.removals.length > 0) {
    const domains = [...new Set(observations.map((o) => o.domain))]
      .map((d) => DOMAIN_LABELS[d])
      .join(', ')
    patch.notes.push(
      `Kleine Korrekturen an dieser Woche (${domains}). Nichts davon wird gespeichert ` +
        `oder gelernt — dafür ist es zu früh.`,
    )
  }

  return patch
}

/**
 * The next day that is free of a same-domain action, searched from tomorrow
 * within the current week. Stacking a make-up session onto a day that already
 * has one is how a plan starts to feel like a second job.
 */
function nextFreeDate(today: string, observations: Observation[]): string | null {
  const occupied = new Set(observations.map((o) => o.scheduledOn))
  for (let offset = 1; offset <= remainingDays(today); offset++) {
    const candidate = addDays(today, offset)
    if (!occupied.has(candidate)) return candidate
  }
  return null
}

/** Days left in the week after `today`. Plan care never reaches into next week. */
function remainingDays(today: string): number {
  const index = WEEKDAYS.indexOf(weekdayOf(today) as Weekday)
  return WEEKDAYS.length - 1 - index
}
