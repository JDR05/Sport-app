// Reading everything the engine needs for one person, and writing it back.
//
// Why the plan itself is not stored here: it is a pure function of these rows.
// `generatePlan` has no clock, no randomness and no network, and 729 tests rely
// on the same input producing the same plan — so recomputing is free and cannot
// disagree with what was saved. Persisting it now would create a second source
// of truth for no gain.
//
// That changes in the check-in step, where a plan item needs a stable id to
// attach a status to, and again for experiments, which compare a plan before
// and after. Then plans get written; today they do not.
//
// Every query here relies on row level security for ownership. `profile_id` is
// still passed explicitly — a query that reads whatever the session happens to
// be is one refactor away from reading everything.

import 'server-only'
import {
  commitmentsSignature, readCommitmentInsights,
} from '@/lib/domain/commitmentInsights'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { withPreferences } from '@/lib/engine/proposed'
import {
  readActionPreferences, readAiProposal, readCommitments, readConstraintValue, readFreeSlots, readMind,
  readWakeTimes,
  readNutrition, readSexAtBirth, readSleep, readSport, readWorkPattern,
} from './schemas'
import type {
  AiProposal, Constraint, Goal, GoalMetric, IntakeAnswer, PersonalRule, PlanInput, Profile,
  Schedule,
} from '@/lib/domain/types'


/**
 * Everything except `today`. The date stays with the client on purpose: the
 * server runs in UTC, and someone planning their evening at half past midnight
 * in Berlin would otherwise be handed yesterday's week.
 */
export type StoredPlanInput = Omit<PlanInput, 'today'>

/**
 * The database could not answer. Deliberately not the same as "there is
 * nothing stored yet".
 *
 * The two used to be indistinguishable: every query result was read as data or
 * nothing, errors included. A single failed read therefore looked exactly like
 * a person who had never set anything up, and the app answered the only way it
 * could — by sending them through the whole intake again, which then replaced
 * the goal they already had. Losing someone's setup because one query hiccuped
 * is not an acceptable failure mode, so this is loud instead.
 */
export class PlanInputUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanInputUnavailableError'
  }
}

/**
 * Null means: this person has not finished the onboarding yet.
 *
 * Memoized per request. It was called three times on the way to rendering
 * Fortschritt — once by the layout to decide whether a goal exists, once by
 * the page, once inside weeklyReview — and each call is seven queries. Three
 * identical round trips to the database before anything appears on screen,
 * on every single tap of the bottom bar.
 */
/**
 * Just: has this person finished the intake?
 *
 * The signed-in layout asked that question by loading the *entire* plan input —
 * seven selects, one of them every measurement ever recorded, on every tap of
 * the bottom bar. On Fortschritt and Insights that work is shared, because
 * `loadPlanInput` is memoized per request and those pages need it anyway. On
 * Heute and Plan it is not: both are client shells that fetch their week
 * separately, so those seven queries were the *whole* server cost of the
 * navigation and none of it was used. "Wenn ich irgendwo 'n neuen Tab
 * anklick, es geht viel zu lange."
 *
 * Two indexed lookups instead, both answering exactly what the layout asks.
 */
export const hasCompletedIntake = cache(async function hasCompletedIntake(
  profileId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const [profileRow, goalRow] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', profileId).maybeSingle(),
    supabase
      .from('goals')
      .select('id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  // Same rule as loadPlanInput: a failed read is reported, never read as "this
  // person has nothing". Answering "nothing" here sends someone through the
  // whole intake again and replaces the goal they already had.
  const failed = [profileRow, goalRow].map((r) => r.error).find((e) => e !== null)
  if (failed) throw new PlanInputUnavailableError(failed.message)

  return Boolean(profileRow.data && goalRow.data)
})

export const loadPlanInput = cache(async function loadPlanInput(
  profileId: string,
): Promise<StoredPlanInput | null> {
  const supabase = await createClient()

  // Fetched flat rather than as a nested select: the simplified generated types
  // carry no relationship metadata, and reaching around the type system to save
  // one round trip is a bad trade.
  const [
    profileRow, goalRow, metricRows, scheduleRow, constraintRows, ruleRows, measurementRows,
  ] =
    await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase
      .from('goals')
      .select('*')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase.from('goal_metrics').select('*').eq('profile_id', profileId),
    supabase.from('schedules').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('constraints').select('*').eq('profile_id', profileId),
    supabase
      .from('personal_rules')
      .select('*')
      .eq('profile_id', profileId)
      .eq('active', true),
    // The latest reading per metric. Measurements were written, drawn on the
    // Progress chart, and read by nothing that plans — so the plan was built
    // from the start value for ever. See ADR-077.
    supabase
      .from('measurements')
      .select('metric_key, value, measured_at')
      .eq('profile_id', profileId)
      .order('measured_at', { ascending: false }),
  ])

  // A failed read is reported, never interpreted. This also covers the case
  // where two goals are somehow active at once: maybeSingle() errors on two
  // rows, and treating that as "no goal" would have quietly started a third.
  // measurementRows belongs in this list. Without it a transient error read as
  // "no measurements", every currentValue stayed null, and the plan was built
  // from the goal's *start* value — the exact regression ADR-077 was written to
  // fix, reachable again through an unreported error instead of a missing
  // feature.
  const failed = [
    profileRow, goalRow, metricRows, scheduleRow, constraintRows, ruleRows, measurementRows,
  ]
    .map((r) => r.error)
    .find((e) => e !== null)
  if (failed) throw new PlanInputUnavailableError(failed.message)

  // No goal means no plan. Everything else can be missing and the engine will
  // record an assumption instead of failing.
  if (!profileRow.data || !goalRow.data) return null

  const p = profileRow.data
  const profile: Profile = {
    birthYear: p.birth_year,
    heightCm: p.height_cm,
    weightKg: p.weight_kg,
    sexAtBirth: readSexAtBirth(p.sex_at_birth),
    sport: readSport(p.sport),
    nutrition: readNutrition(p.nutrition),
    sleep: readSleep(p.sleep),
    mind: readMind(p.mind),
  }

  const g = goalRow.data
  const goal: Goal = {
    rawText: g.raw_text,
    archetype: g.archetype,
    targetDate: g.target_date,
    classifiedBy: g.classified_by,
  }

  // Newest first from the query, so the first hit per key is the latest.
  const latest = new Map<string, number>()
  for (const row of measurementRows.data ?? []) {
    if (!latest.has(row.metric_key)) latest.set(row.metric_key, Number(row.value))
  }

  const metrics: GoalMetric[] = (metricRows.data ?? [])
    .filter((m) => m.goal_id === g.id)
    .map((m) => ({
      metricKey: m.metric_key,
      startValue: m.start_value,
      targetValue: m.target_value,
      currentValue: latest.get(m.metric_key) ?? null,
      unit: m.unit,
    }))

  const schedule: Schedule = {
    workPattern: readWorkPattern(scheduleRow.data?.work_pattern),
    freeSlots: readFreeSlots(scheduleRow.data?.free_slots),
    commitments: readCommitments(scheduleRow.data?.commitments),
    wakeTimes: readWakeTimes(scheduleRow.data?.wake_times),
  }

  const constraints: Constraint[] = []
  for (const row of constraintRows.data ?? []) {
    const value = readConstraintValue(row.value)
    if (value) constraints.push({ kind: row.kind, hard: row.hard, value })
  }

  // Trial rules are included on purpose: the rule a running experiment is
  // testing has to reach the planner, or the fortnight it runs for produces
  // exactly the plan the person already had and the result is noise.
  const personalRules: PersonalRule[] = (ruleRows.data ?? []).map((r) => ({
    ruleKey: r.rule_key,
    ruleValue: (r.rule_value ?? {}) as Record<string, unknown>,
    confidence: Number(r.confidence),
    trial: r.trial,
  }))

  return {
    profile,
    goal,
    metrics,
    constraints,
    schedule,
    personalRules,
    // The proposal as this person wants it, not as the model first offered
    // it. Applied here, at the one place the proposal is read, so the plan,
    // the adoption into a running week and the Insights list can never
    // disagree about how often something should happen.
    aiProposal: applyPreference(readAiProposal(g.ai_proposal), g.action_preferences),
    // The stored judgement is used only while it still describes this week.
    // Commitments are editable, and an insight about a training somebody has
    // since dropped would keep shaping the plan from a row nobody can see.
    commitmentInsights:
      g.commitment_insights_for === commitmentsSignature(schedule.commitments)
        ? readCommitmentInsights(g.commitment_insights)
        : null,
    intakeAnswers: readIntakeAnswers(g.intake_answers),
  }
})

/** The stored proposal, narrowed by whatever the person asked for. */
function applyPreference(proposal: AiProposal | null, stored: unknown): AiProposal | null {
  if (!proposal) return null
  const narrowed = withPreferences(proposal, readActionPreferences(stored))
  // Turning every action off is a legitimate answer and means "no proposal",
  // not "a proposal with nothing in it" — downstream code tests for the
  // proposal's presence, not for its length.
  return narrowed.actions.length > 0 ? narrowed : null
}

/**
 * Answers to the questions the model asked before planning.
 *
 * Parsed defensively rather than cast: this column is jsonb, so the database
 * guarantees it is an array and nothing more. A malformed entry becomes no
 * entry — a proposal built on a half-read answer would be worse than one built
 * without it.
 */
function readIntakeAnswers(value: unknown): IntakeAnswer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { question, answer } = entry as Record<string, unknown>
    if (typeof question !== 'string' || question.length === 0) return []
    return [{ question, answer: typeof answer === 'string' ? answer : null }]
  })
}
