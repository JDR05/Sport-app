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
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fromRow, type ItemRow } from './item-mapping'
import { analysisWindowStart, toObservations } from './observations'
import { loadPlanInput } from './plan-input'
import { loadCheckIns } from './tracking'
import { addDays, startOfWeek } from '@/lib/engine/dates'
import { analyze, completionRate, type Analysis, type Observation } from '@/lib/adaptive'
import { ANALYSIS_WEEKS } from '@/lib/adaptive/constants'

export type WeeklyReview = {
  /**
   * Everything in the analysis window, across goals.
   *
   * Deliberately unscoped: behaviour is behaviour, and a Wednesday someone
   * kept missing under their old goal is still evidence about Wednesdays.
   */
  observations: Observation[]
  /**
   * This week, limited to the goal the person is actually pursuing.
   *
   * The rings describe the week as the app shows it, and Today and Plan show
   * one goal's plan. Without this the two disagreed the moment somebody
   * changed their goal mid-week: Plan listed seven actions, the ring counted
   * fourteen, and Progress then linked to a plan where half of them did not
   * exist. A second change made it twenty-one.
   */
  thisWeek: Observation[]
  analysis: Analysis
  /** Share of resolved actions completed, or null when nothing is resolved. */
  completion: number | null
  completionThisWeek: number | null
  /** How many weeks actually carry data — what the UI counts towards. */
  weeksWithData: number
}

/**
 * Every action in one week, including the days still ahead.
 *
 * loadObservations deliberately stops at today — evidence is what has already
 * happened. Plan care needs the opposite: it is choosing a day to move
 * something to, and a day it cannot see looks empty. It saw Thursday through
 * Sunday as free of everything and would have stacked make-ups onto a day that
 * already carries training.
 */
export async function loadWeekItems(
  profileId: string,
  weekStart: string,
): Promise<Observation[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('plan_items')
    .select('*')
    .eq('profile_id', profileId)
    .gte('scheduled_on', weekStart)
    .lte('scheduled_on', addDays(weekStart, 6))
    .order('scheduled_on', { ascending: true })

  return toObservations((data ?? []).map((row) => fromRow(row as ItemRow)))
}

/**
 * Days on which at least one action was actually answered.
 *
 * The Playbook counts towards its first rule with this. Deliberately days with
 * an *answer* rather than days since signing up: a week nobody tracked brings
 * the app no closer to knowing anything, and a bar that filled up anyway would
 * be promising something it cannot deliver.
 */
export async function countDaysWithData(profileId: string): Promise<number> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('plan_items')
    .select('scheduled_on, status')
    .eq('profile_id', profileId)
    .in('status', ['done', 'moved', 'missed'])

  return new Set((data ?? []).map((row) => row.scheduled_on)).size
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
export const weeklyReview = cache(async function weeklyReview(
  profileId: string,
  today: string,
): Promise<WeeklyReview | null> {
  const weekStart = startOfWeek(today)

  // Everything that does not depend on anything else, at once.
  //
  // These ran one after another, and each is a round trip to a database in
  // another region. Nothing on this screen appears until the last of them
  // comes back, so a chain of five is five times the wait for no reason —
  // none of them needs an answer from any of the others.
  const [input, observations, wholeWeek, checkIns, activeGoal] = await Promise.all([
    loadPlanInput(profileId),
    loadObservations(profileId, today),
    loadWeekItems(profileId, weekStart),
    loadCheckIns(profileId, analysisWindowStart(today)),
    activeGoalId(profileId),
  ])
  if (!input) return null

  const thisWeek = observations.filter((o) => o.scheduledOn >= weekStart)
  const thisWeekForGoal = await scopeToActiveGoal(profileId, activeGoal, thisWeek, weekStart, today)

  // The check-ins over the same window. Without them a pattern can only be
  // stated bare — "Dienstags läuft es schlechter" — and a shortfall with no
  // circumstance beside it reads as a verdict on the person.
  const days = checkIns.map((c) => ({
    date: c.checkedInOn,
    energy: c.energy,
    mood: c.mood,
    stress: c.stress,
    sleepHours: c.sleepHours,
    dietQuality: c.dietQuality,
    soreness: c.soreness,
    alcoholUnits: c.alcoholUnits,
    caffeineLate: c.caffeineLate,
  }))

  return {
    observations,
    thisWeek: thisWeekForGoal,
    analysis: analyze({ ...input, today }, observations, { days, week: wholeWeek }),
    completion: completionRate(observations),
    completionThisWeek: completionRate(thisWeekForGoal),
    weeksWithData: new Set(observations.map((o) => startOfWeek(o.scheduledOn))).size,
  }
})

/**
 * Narrows a week to the plan belonging to the active goal.
 *
 * A retired goal's items stay in plan_items on purpose — they are part of what
 * happened, and detection reads them. They just must not be counted as part of
 * *this* week's plan, because the screens that show that week show one goal.
 *
 * Falls back to the unfiltered week rather than to nothing: if the plan rows
 * cannot be read, showing the week slightly too wide is a smaller error than
 * showing an empty one.
 */
/** The active goal's id, or null. Fetched alongside everything else. */
async function activeGoalId(profileId: string): Promise<string | null> {
  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  return goal.data?.id ?? null
}

async function scopeToActiveGoal(
  profileId: string,
  goalId: string | null,
  week: Observation[],
  weekStart: string,
  today: string,
): Promise<Observation[]> {
  if (week.length === 0 || goalId === null) return week
  const supabase = await createClient()

  const plans = await supabase
    .from('plans')
    .select('id')
    .eq('profile_id', profileId)
    .eq('goal_id', goalId)
    .gte('week_start', weekStart)
    .lte('week_start', today)
  if (plans.error) return week

  const planIds = new Set((plans.data ?? []).map((row) => row.id))
  if (planIds.size === 0) return week

  const items = await supabase
    .from('plan_items')
    .select('id')
    .eq('profile_id', profileId)
    .in('plan_id', [...planIds])
  if (items.error) return week

  const belongs = new Set((items.data ?? []).map((row) => row.id))
  return week.filter((o) => belongs.has(o.itemId))
}
