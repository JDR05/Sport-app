// The ongoing half of the AI, once a week.
//
// Until now the model was asked twice per goal and then never again, so the
// app could only ever notice what somebody had written a rule for. Two things
// follow from that, and both are why this exists:
//
//   * `check_ins.note` has been collected every day since the check-in shipped
//     and read by nothing. Somebody types "war krank" and the deterministic
//     engine sees three missed actions and starts forming a pattern about
//     Wednesdays. That is not a missing feature, it is a wrong answer.
//   * Connections across domains that no rule anticipated stay invisible.
//
// Written once per week and then fixed, for the same reason a plan is: an
// observation that rewrites itself under someone is not an observation. The
// unique index is the check — two requests arriving together cannot produce
// two notes.

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import { loadCheckIns } from './tracking'
import { loadPlanInput } from './plan-input'
import { weeklyReview } from './analysis'
import { weekScores } from '@/lib/adaptive/scores'
import { DOMAIN_LABELS, SLOT_LABELS, WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { addDays, startOfWeek } from '@/lib/engine/dates'
import type { Deviation } from '@/lib/adaptive'
import type { Strength } from '@/lib/adaptive/strengths'

export type WeeklyNote = {
  weekStart: string
  observation: string
  suggestion: string
  question: string | null
  evidence: string[]
}

/** What is on screen. Null is the normal answer for most weeks. */
export const loadWeeklyNote = cache(async function loadWeeklyNote(
  profileId: string,
  today: string,
): Promise<WeeklyNote | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_notes')
    .select('*')
    .eq('profile_id', profileId)
    .eq('week_start', startOfWeek(today))
    .maybeSingle()

  if (!data) return null
  return {
    weekStart: data.week_start,
    observation: data.observation,
    suggestion: data.suggestion,
    question: data.question,
    evidence: Array.isArray(data.evidence) ? (data.evidence as string[]) : [],
  }
})

/**
 * Writes this week's note if there is not one yet and there is something to
 * say. Never throws: no key, a refusal, a failed safety check and an empty
 * week all end the same way — no note, and the deterministic insights stand.
 */
export async function ensureWeeklyNote(
  profileId: string,
  today: string,
): Promise<WeeklyNote | null> {
  try {
    return await run(profileId, today)
  } catch {
    return null
  }
}

async function run(profileId: string, today: string): Promise<WeeklyNote | null> {
  const weekStart = startOfWeek(today)

  const existing = await loadWeeklyNote(profileId, today)
  if (existing) return existing

  // Not before there is a week to look at. A note written on Monday morning
  // about a week nobody has lived yet is the filler this feature exists to
  // avoid, and it would burn the one write the unique index allows.
  if (today < addDays(weekStart, 3)) return null

  const [input, review] = await Promise.all([
    loadPlanInput(profileId),
    weeklyReview(profileId, today),
  ])
  if (!input || !review) return null

  const scores = weekScores(review.thisWeek)
  if (scores.overall.resolved === 0) return null

  // The free text, and the reason for all of this.
  const checkIns = await loadCheckIns(profileId, weekStart)
  const notes = checkIns
    .filter((c) => c.note !== null && c.note.trim().length > 0)
    .map((c) => ({ date: c.checkedInOn, text: c.note!.trim().slice(0, 300) }))

  const previous = await previousObservation(profileId, weekStart)

  const adapter = await adapterFor(profileId)
  const result = await adapter.weeklyNote({
    goalText: input.goal.rawText,
    archetype: input.goal.archetype,
    weekStart,
    completion: scores.domains.map((d) => ({
      domain: DOMAIN_LABELS[d.domain] ?? d.domain,
      done: d.done,
      resolved: d.resolved,
    })),
    deviations: review.analysis.deviations.map(describeDeviation),
    strengths: review.analysis.strengths.map(describeStrength),
    rules: input.personalRules.map((r) => r.ruleKey),
    notes,
    previous,
  })

  // Silence is a designed outcome, not a failure — for a quiet week, for a
  // model that declined, and for one whose answer did not survive the checks.
  if (!result.ok || !result.value.hasSomethingToSay) return null

  const note = result.value
  const evidence = note.basedOn.length > 0 ? note.basedOn : [`week.${weekStart}`]

  const written = await supabaseInsert(profileId, weekStart, {
    observation: note.observation,
    suggestion: note.suggestion,
    question: note.question,
    evidence,
    source: adapter.name,
  })

  // A lost race is fine: the winner's note is the one that counts, and there
  // can only ever be one per week.
  if (!written) return loadWeeklyNoteFresh(profileId, weekStart)

  return { weekStart, observation: note.observation, suggestion: note.suggestion, question: note.question, evidence }
}

async function supabaseInsert(
  profileId: string,
  weekStart: string,
  row: {
    observation: string
    suggestion: string
    question: string | null
    evidence: string[]
    source: string
  },
): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase.from('weekly_notes').insert({
    profile_id: profileId,
    week_start: weekStart,
    observation: row.observation,
    suggestion: row.suggestion,
    question: row.question,
    evidence: row.evidence,
    source: row.source,
  })
  return error === null
}

/** Uncached read, for the moment after losing an insert race. */
async function loadWeeklyNoteFresh(
  profileId: string,
  weekStart: string,
): Promise<WeeklyNote | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_notes')
    .select('*')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (!data) return null
  return {
    weekStart: data.week_start,
    observation: data.observation,
    suggestion: data.suggestion,
    question: data.question,
    evidence: Array.isArray(data.evidence) ? (data.evidence as string[]) : [],
  }
}

/** Last week's observation, so the model does not say the same thing twice. */
async function previousObservation(profileId: string, weekStart: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_notes')
    .select('observation')
    .eq('profile_id', profileId)
    .lt('week_start', weekStart)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.observation ?? null
}

function describeDeviation(d: Deviation): string {
  const where =
    d.dimension === 'weekday'
      ? (WEEKDAY_LABELS[d.bucket as keyof typeof WEEKDAY_LABELS] ?? d.bucket)
      : d.dimension === 'time_slot'
        ? (SLOT_LABELS[d.bucket as keyof typeof SLOT_LABELS] ?? d.bucket)
        : d.bucket
  return `${where}: ${d.missed} von ${d.resolved} ausgefallen, sonst ${Math.round(d.comparisonMissRate * 100)} %`
}

function describeStrength(s: Strength): string {
  const where =
    s.dimension === 'weekday'
      ? (WEEKDAY_LABELS[s.bucket as keyof typeof WEEKDAY_LABELS] ?? s.bucket)
      : s.dimension === 'time_slot'
        ? (SLOT_LABELS[s.bucket as keyof typeof SLOT_LABELS] ?? s.bucket)
        : s.bucket
  return `${where}: ${s.done} von ${s.resolved} umgesetzt`
}
