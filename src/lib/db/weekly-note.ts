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
// Written once per *occasion* and then fixed, for the same reason a plan is:
// an observation that rewrites itself under someone is not an observation. The
// unique index is the check — two requests arriving together cannot produce
// two impulses for the same occasion.
//
// The occasion used to be "it is Thursday", full stop. That is a good rhythm
// for reflection and a bad one for everything else: somebody gives the same
// reason three times on Monday and Tuesday and the app sits on it until
// Thursday, by which point the week is decided. Now `detectTrigger` decides
// whether something has happened worth speaking about, deterministically, and
// the model is told what that something was (ADR-097).

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import { loadCheckIns } from './tracking'
import { weekReasons } from './reaction'
import { REASON_LABELS } from '@/lib/adaptive/reaction'
import { loadPlanInput } from './plan-input'
import { weeklyReview } from './analysis'
import { weekScores } from '@/lib/adaptive/scores'
import {
  detectTrigger, MIN_DAYS_BETWEEN_IMPULSES, type ImpulseTrigger,
} from '@/lib/adaptive/triggers'
import { DOMAIN_LABELS, SLOT_LABELS, WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { daysBetween, startOfWeek } from '@/lib/engine/dates'
import type { Deviation } from '@/lib/adaptive'
import type { Strength } from '@/lib/adaptive/strengths'

export type WeeklyNote = {
  weekStart: string
  observation: string
  suggestion: string
  question: string | null
  evidence: string[]
  /** Why this one was written. 'weekly' is the calendar; the rest are events. */
  trigger: ImpulseTrigger
  /**
   * The day it was written, which is not the same as the week it is about.
   *
   * Today shows an impulse on the day it arrives and not afterwards. That is
   * what makes it an event rather than a banner: it appears because something
   * happened, and the next day it has moved to Insights, where the history
   * lives. No "seen" flag, because a date already says it.
   */
  writtenOn: string
}

/**
 * The impulses of the current week, newest first.
 *
 * A list rather than a single row since ADR-097: a week can now carry one per
 * occasion. `maybeSingle` here would have thrown the moment a second one
 * existed — which is exactly the kind of failure that only appears in the week
 * the feature starts working.
 */
export const loadWeeklyNotes = cache(async function loadWeeklyNotes(
  profileId: string,
  today: string,
): Promise<WeeklyNote[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_notes')
    .select('*')
    .eq('profile_id', profileId)
    .eq('week_start', startOfWeek(today))
    .order('created_at', { ascending: false })

  return (data ?? []).map(toNote)
})

/** The most recent impulse, which is what the screen leads with. */
export async function loadWeeklyNote(
  profileId: string,
  today: string,
): Promise<WeeklyNote | null> {
  return (await loadWeeklyNotes(profileId, today))[0] ?? null
}

function toNote(row: {
  week_start: string
  observation: string
  suggestion: string
  question: string | null
  evidence: unknown
  trigger: string
  created_at?: string
}): WeeklyNote {
  return {
    weekStart: row.week_start,
    observation: row.observation,
    suggestion: row.suggestion,
    question: row.question,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    trigger: row.trigger as ImpulseTrigger,
    writtenOn: (row.created_at ?? '').slice(0, 10),
  }
}

/**
 * Writes an impulse if something has happened worth writing about.
 *
 * Never throws: no key, a refusal, a failed safety check and a quiet week all
 * end the same way — no impulse, and the deterministic insights stand.
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

  const existing = await loadWeeklyNotes(profileId, today)

  // The cheapest check first, because this runs on every load of Today.
  //
  // Two days between impulses is the limit that keeps this from becoming a
  // notification feed, and it also means most loads stop here after a single
  // small query rather than assembling a whole week.
  const lastOn = await lastImpulseDate(profileId)
  if (lastOn && daysBetween(lastOn, today) < MIN_DAYS_BETWEEN_IMPULSES) {
    return existing[0] ?? null
  }

  const [input, review] = await Promise.all([
    loadPlanInput(profileId),
    weeklyReview(profileId, today),
  ])
  if (!input || !review) return existing[0] ?? null

  const scores = weekScores(review.thisWeek)
  // Nothing answered is nothing to talk about, whatever day it is.
  if (scores.overall.resolved === 0) return existing[0] ?? null

  // The free text, and the reason for all of this.
  const [checkIns, reasons] = await Promise.all([
    loadCheckIns(profileId, weekStart),
    weekReasons(profileId, weekStart),
  ])

  // Is there an occasion? Deterministic and conservative: on most days the
  // answer is no, and the existing impulses simply stand.
  //
  // Deliberately *after* the reads and before the model call. Whether
  // something happened is a count over rows; what to say about it is the only
  // part worth a round trip to a provider.
  const trigger = detectTrigger({
    today,
    weekStart,
    week: review.thisWeek,
    reasons: reasons.counts,
    used: existing.map((n) => n.trigger),
    lastImpulseOn: lastOn,
  })
  if (!trigger) return existing[0] ?? null
  const notes = [
    ...checkIns
      .filter((c) => c.note !== null && c.note.trim().length > 0)
      .map((c) => ({ date: c.checkedInOn, text: c.note!.trim().slice(0, 300) })),
    // Notes left on an action itself belong in the same pile: they were typed
    // by the same person about the same week, and splitting them into two
    // lists would only invite the model to weigh one over the other.
    ...reasons.notes,
  ].sort((a, b) => a.date.localeCompare(b.date))

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
    reasons: reasons.counts.map(
      (c) =>
        `${REASON_LABELS[c.reason]} — ${c.count}× bei ${DOMAIN_LABELS[c.domain as keyof typeof DOMAIN_LABELS] ?? c.domain}`,
    ),
    notes,
    occasion: trigger.occasion,
    previous,
  })

  // Silence is a designed outcome, not a failure — for a quiet week, for a
  // model that declined, and for one whose answer did not survive the checks.
  // The occasion does not oblige it to speak: a trigger says something
  // happened, not that there is anything useful to say about it.
  if (!result.ok || !result.value.hasSomethingToSay) return existing[0] ?? null

  const note = result.value
  // Falls back to the trigger's own evidence rather than to the week, which is
  // the more specific claim: an impulse about three "zu müde" taps should cite
  // those taps.
  const evidence = note.basedOn.length > 0 ? note.basedOn : trigger.evidence

  const written = await supabaseInsert(profileId, weekStart, {
    observation: note.observation,
    suggestion: note.suggestion,
    question: note.question,
    evidence,
    source: adapter.name,
    trigger: trigger.trigger,
  })

  // A lost race is fine: the winner's impulse is the one that counts, and
  // there can only ever be one per occasion.
  if (!written) return loadWeeklyNoteFresh(profileId, weekStart, trigger.trigger)

  return {
    weekStart,
    observation: note.observation,
    suggestion: note.suggestion,
    question: note.question,
    evidence,
    trigger: trigger.trigger,
    // Written just now, by definition. Not read back from the row: that would
    // be a second round trip to learn something this line already knows.
    writtenOn: today,
  }
}

/**
 * When the last impulse was written, in any week.
 *
 * Read as a date rather than counted per week because the gap has to hold
 * across a Sunday: an impulse on Sunday evening and another on Monday morning
 * are two different weeks and one day apart, which is exactly the burst this
 * limit exists to prevent.
 */
async function lastImpulseDate(profileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_notes')
    .select('created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.created_at ? data.created_at.slice(0, 10) : null
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
    trigger: ImpulseTrigger
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
    trigger: row.trigger,
  })
  return error === null
}

/** Uncached read, for the moment after losing an insert race. */
async function loadWeeklyNoteFresh(
  profileId: string,
  weekStart: string,
  trigger: ImpulseTrigger,
): Promise<WeeklyNote | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_notes')
    .select('*')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .eq('trigger', trigger)
    .maybeSingle()
  return data ? toNote(data) : null
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
