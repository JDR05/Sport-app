// The rings.
//
// A ring is a claim about a week, so what it counts has to be defensible. It
// counts **only what the person actually judged**: done and moved fill it,
// missed does not, and an action nobody touched is left out of the sum
// entirely. That is the same rule detection uses (ADR-011), for the same
// reason — an untracked day is missing information, not a failure, and a ring
// that sank on quiet days would punish exactly the weeks someone had a hard
// time.
//
// Which makes a ring at 100% with two actions judged out of nine an honest
// statement and a misleading picture at once. So every ring carries how many
// it is based on, and the UI never shows the percentage without it.
//
// The playbook forbids gamification and streaks. There is nothing here to
// break: no reward, no colour that turns green at a threshold, no history of
// consecutive weeks. It is a measurement, and it may go down.

import type { Observation } from './types'
import type { PlanDomain } from '@/lib/domain/types'

export type Score = {
  /** Null when nothing was judged — not zero. Zero would be a false claim. */
  rate: number | null
  done: number
  missed: number
  /** Judged either way. The denominator of `rate`. */
  resolved: number
  /** Neither judged nor missed: no information at all. */
  untouched: number
  planned: number
}

export type DomainScore = Score & { domain: PlanDomain }

export type WeekScores = {
  overall: Score
  domains: DomainScore[]
}

const DONE: readonly string[] = ['done', 'moved']

export function scoreOf(observations: Observation[]): Score {
  const done = observations.filter((o) => DONE.includes(o.status)).length
  const missed = observations.filter((o) => o.status === 'missed').length
  const resolved = done + missed

  return {
    rate: resolved === 0 ? null : Math.round((done / resolved) * 100) / 100,
    done,
    missed,
    resolved,
    // `not_relevant` is a planning error, not a gap in someone's week, so it is
    // not counted as something they left untouched either.
    untouched: observations.filter((o) => o.status === 'unknown' || o.status === 'planned')
      .length,
    planned: observations.length,
  }
}

/**
 * One ring per domain that actually appears this week.
 *
 * Domains with nothing planned are absent rather than empty: an area the plan
 * does not touch is not an area someone is failing at, and an empty ring reads
 * as one.
 */
export function weekScores(observations: Observation[]): WeekScores {
  const byDomain = new Map<PlanDomain, Observation[]>()
  for (const o of observations) {
    const list = byDomain.get(o.domain) ?? []
    list.push(o)
    byDomain.set(o.domain, list)
  }

  const domains: DomainScore[] = [...byDomain.entries()]
    .map(([domain, items]) => ({ domain, ...scoreOf(items) }))
    // Most planned first, so the ring the week was mostly about leads.
    .sort((a, b) => b.planned - a.planned)

  return { overall: scoreOf(observations), domains }
}
