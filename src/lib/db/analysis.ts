// Running the adaptive engine on what actually happened.
//
// The engine has been ready since ADR-029 and has had nothing to read. This is
// where it gets its input: every plan item from the last few weeks, with the
// status the person gave it.
//
// Superseded plans are included on purpose. A plan replaced mid-week describes
// a goal someone no longer has, but the actions they took under it are still
// things they did — and the patterns worth finding (Wednesday never works, long
// sessions never happen) are about the person, not about the goal.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { fromRow, type ItemRow } from './item-mapping'
import { analysisWindowStart, toObservations } from './observations'
import { loadPlanInput } from './plan-input'
import { loadCheckIns } from './tracking'
import { startOfWeek } from '@/lib/engine/dates'
import { analyze, completionRate, type Analysis, type Observation } from '@/lib/adaptive'
import { ANALYSIS_WEEKS } from '@/lib/adaptive/constants'

export type WeeklyReview = {
  observations: Observation[]
  analysis: Analysis
  /** Share of resolved actions completed, or null when nothing is resolved. */
  completion: number | null
  completionThisWeek: number | null
  /** How many weeks actually carry data — what the UI counts towards. */
  weeksWithData: number
}

export async function loadObservations(
  profileId: string,
  today: string,
  weeks: number = ANALYSIS_WEEKS,
): Promise<Observation[]> {
  const supabase = await createClient()
  const from = analysisWindowStart(today, weeks)

  const { data } = await supabase
    .from('plan_items')
    .select('*')
    .eq('profile_id', profileId)
    .gte('scheduled_on', from)
    .lte('scheduled_on', today)
    .order('scheduled_on', { ascending: true })

  return toObservations((data ?? []).map((row) => fromRow(row as ItemRow)))
}

/**
 * Null when there is no goal yet. Everything else — including "nothing to say"
 * — comes back as a review with an empty analysis, because "no pattern found"
 * is a real answer and the screens show it as one.
 */
export async function weeklyReview(
  profileId: string,
  today: string,
): Promise<WeeklyReview | null> {
  const input = await loadPlanInput(profileId)
  if (!input) return null

  const observations = await loadObservations(profileId, today)
  const weekStart = startOfWeek(today)
  const thisWeek = observations.filter((o) => o.scheduledOn >= weekStart)

  // The check-ins over the same window. Without them a pattern can only be
  // stated bare — "Dienstags läuft es schlechter" — and a shortfall with no
  // circumstance beside it reads as a verdict on the person.
  const days = (await loadCheckIns(profileId, analysisWindowStart(today))).map((c) => ({
    date: c.checkedInOn,
    energy: c.energy,
    mood: c.mood,
    stress: c.stress,
    sleepHours: c.sleepHours,
  }))

  return {
    observations,
    analysis: analyze({ ...input, today }, observations, { days }),
    completion: completionRate(observations),
    completionThisWeek: completionRate(thisWeek),
    weeksWithData: new Set(observations.map((o) => startOfWeek(o.scheduledOn))).size,
  }
}
