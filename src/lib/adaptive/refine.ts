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
import { addDays, startOfWeek, weekdayOf } from '@/lib/engine/dates'
import { MAX_ITEMS_PER_DAY } from '@/lib/engine/constants'
import { WEEKDAYS, type PlanDomain, type Weekday } from '@/lib/domain/types'
import { DOMAIN_LABELS, WEEKDAY_LABELS } from './labels'

/**
 * @param observations the analysis window — six weeks, across goals
 * @param today ISO date; nothing before it is touched, the past cannot be replanned
 *
 * Only this week is refined, and that is the whole point of the first line of
 * the function. Plan care is handed the same six-week window detection reads,
 * and it used to act on all of it: every `not_relevant` action ever marked was
 * offered for removal again, every week, for six weeks — an action already
 * dropped, reported as news. Every miss in six weeks became a move, and since
 * the search always started from today they all landed on the same date. Five
 * corrections, one day, under a heading that said "an dieser Woche".
 *
 * Detection wants the long window; care wants the week someone is in. They are
 * different questions asked of the same rows.
 */
export function refinePlan(observations: Observation[], today: string): PlanPatch {
  const week = observations.filter((o) => o.scheduledOn >= startOfWeek(today))
  const patch: PlanPatch = { moves: [], removals: [], provisional: true, notes: [] }

  // ------------------------------------------------- planning errors ----
  // `not_relevant` means the plan asked for something that does not apply to
  // this person's life. That is the plan being wrong, so it is corrected
  // quietly — it is never counted as a miss and never becomes a pattern.
  //
  // What a removal names is the *repeats still to come*, not the one already
  // answered. A standing rule is materialised across all seven days, so saying
  // "passt nicht" on Monday leaves six identical copies asking the same
  // question for the rest of the week. The answered one needs nothing done to
  // it; those six are the correction.
  const dismissed = new Set(planningErrors(week).map((o) => o.title))
  for (const item of week) {
    if (!dismissed.has(item.title)) continue
    if (item.scheduledOn < today) continue
    if (item.status !== 'unknown' && item.status !== 'planned') continue
    patch.removals.push({
      itemId: item.itemId,
      reason:
        `„${item.title}" passt nicht zu deinem Alltag. Die Aktion fällt für den Rest der ` +
        `Woche aus dem Plan — sie zählt nicht als verpasst.`,
    })
  }

  // ------------------------------------------------------- single miss --
  // One missed action is not a pattern and must not be treated as one. It is
  // still worth offering the day back, which is a scheduling courtesy rather
  // than a claim about the person.
  //
  // Each make-up claims its day, so two misses land on two days. Stacking them
  // is what turns a courtesy into a backlog.
  const claimed = new Map<string, number>()
  const missedPast = week.filter((o) => o.status === 'missed' && o.scheduledOn < today)
  for (const item of missedPast) {
    const target = nextFreeDate(today, week, claimed, item.domain)
    if (target === null) continue
    claimed.set(target, (claimed.get(target) ?? 0) + 1)
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
    const touched = new Set([
      ...patch.removals.map((r) => r.itemId),
      ...patch.moves.map((m) => m.itemId),
    ])
    const domains = [...new Set(week.filter((o) => touched.has(o.itemId)).map((o) => o.domain))]
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
 *
 * "Free" means free of that domain, which is what the sentence above always
 * said and what the code did not do: it refused any day carrying an action of
 * any kind. Since the health baseline is materialised across all seven days,
 * every day is occupied by that reading — so plan care produced exactly zero
 * moves in all seventy profile/goal combinations. The only visible half of the
 * fast tier never fired, and week one, which this exists for, showed nothing.
 */
function nextFreeDate(
  today: string,
  observations: Observation[],
  /** How many make-ups in this same patch have already taken each day. */
  claimed: ReadonlyMap<string, number>,
  domain: PlanDomain,
): string | null {
  const sameDomain = new Set(
    observations.filter((o) => o.domain === domain).map((o) => o.scheduledOn),
  )

  const load = new Map<string, number>()
  for (const o of observations) load.set(o.scheduledOn, (load.get(o.scheduledOn) ?? 0) + 1)

  for (let offset = 1; offset <= remainingDays(today); offset++) {
    const candidate = addDays(today, offset)
    if (sameDomain.has(candidate) || claimed.has(candidate)) continue
    // The day ceiling is a safety limit, and a make-up is not allowed through
    // it. A moved action lands somewhere with room or it does not land.
    if ((load.get(candidate) ?? 0) + (claimed.get(candidate) ?? 0) >= MAX_ITEMS_PER_DAY) continue
    return candidate
  }
  return null
}

/** Days left in the week after `today`. Plan care never reaches into next week. */
function remainingDays(today: string): number {
  const index = WEEKDAYS.indexOf(weekdayOf(today) as Weekday)
  return WEEKDAYS.length - 1 - index
}
