// The days the app has no answers for, and the actions on them.
//
// Heute loads exactly one week, so its catch-up line could only ever reach back
// to Monday. On this account that left twelve unanswered actions from the
// previous week with no door at all — and the pattern detection needs four
// resolved instances in a bucket before it will say anything, which is why it
// has said nothing in four weeks.
//
// This is a read, and only a read. `ensureWeekPlan` *builds* a week that does
// not exist yet, which is exactly right for the week somebody is in and exactly
// wrong for one that is over: generating a plan for last Tuesday would invent
// actions nobody was ever shown and then ask whether they happened. So nothing
// here creates anything. If a past week was never planned, it has no open days,
// which is the truth.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { fromRow, type ItemRow } from './item-mapping'
import { answerablePastItems, CATCH_UP_DAYS } from '@/lib/domain/openDays'
import { WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { addDays, formatGermanDate, weekdayOf } from '@/lib/engine/dates'
import type { PlanDomain, PlanTrack } from '@/lib/domain/types'


export type CatchUpItem = {
  id: string
  title: string
  domain: PlanDomain
  track: PlanTrack
}

export type CatchUpDay = {
  date: string
  /** "Montag", for the heading. */
  weekday: string
  /** "8. September 2026", so a Montag two weeks back is not mistaken for this one. */
  formatted: string
  items: CatchUpItem[]
}

/**
 * Every past day inside the window that still holds an unanswered action,
 * oldest first, with the actions themselves.
 *
 * Oldest first because that is the one closest to being forgotten for good, and
 * because filling in a week from the front is how anybody reconstructs it.
 */
export async function loadCatchUp(profileId: string, today: string): Promise<CatchUpDay[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('plan_items')
    .select('*')
    .eq('profile_id', profileId)
    .gte('scheduled_on', addDays(today, -CATCH_UP_DAYS))
    .lt('scheduled_on', today)
    .eq('status', 'unknown')
    .order('scheduled_on', { ascending: true })

  const answerable = answerablePastItems(
    (data ?? []).map((row) => fromRow(row as ItemRow)),
    today,
  )

  // One filter decides both which days appear and which rows appear under them,
  // so a day heading can never arrive with an empty card beneath it. See
  // answerablePastItems for what it excludes and why each exclusion is a rule.
  const byDay = new Map<string, CatchUpItem[]>()
  for (const item of answerable) {
    const day = byDay.get(item.scheduledOn) ?? []
    day.push({ id: item.id, title: item.title, domain: item.domain, track: item.track })
    byDay.set(item.scheduledOn, day)
  }

  return [...byDay.keys()]
    .sort()
    .map((date) => ({
      date,
      weekday: WEEKDAY_LABELS[weekdayOf(date)] ?? '',
      formatted: formatGermanDate(date),
      items: byDay.get(date) ?? [],
    }))
}
