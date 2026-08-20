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
import { createClient } from '@/lib/supabase/server'
import {
  readAiProposal, readConstraintValue, readFreeSlots, readMind, readNutrition,
  readSexAtBirth, readSleep, readSport, readWorkPattern,
} from './schemas'
import type {
  Constraint, Goal, GoalMetric, PersonalRule, PlanInput, Profile, Schedule,
} from '@/lib/domain/types'


/**
 * Everything except `today`. The date stays with the client on purpose: the
 * server runs in UTC, and someone planning their evening at half past midnight
 * in Berlin would otherwise be handed yesterday's week.
 */
export type StoredPlanInput = Omit<PlanInput, 'today'>

/** Null means: this person has not finished the onboarding yet. */
export async function loadPlanInput(profileId: string): Promise<StoredPlanInput | null> {
  const supabase = await createClient()

  // Fetched flat rather than as a nested select: the simplified generated types
  // carry no relationship metadata, and reaching around the type system to save
  // one round trip is a bad trade.
  const [profileRow, goalRow, metricRows, scheduleRow, constraintRows, ruleRows] =
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
  ])

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

  const metrics: GoalMetric[] = (metricRows.data ?? [])
    .filter((m) => m.goal_id === g.id)
    .map((m) => ({
      metricKey: m.metric_key,
      startValue: m.start_value,
      targetValue: m.target_value,
      unit: m.unit,
    }))

  const schedule: Schedule = {
    workPattern: readWorkPattern(scheduleRow.data?.work_pattern),
    freeSlots: readFreeSlots(scheduleRow.data?.free_slots),
  }

  const constraints: Constraint[] = []
  for (const row of constraintRows.data ?? []) {
    const value = readConstraintValue(row.value)
    if (value) constraints.push({ kind: row.kind, hard: row.hard, value })
  }

  const personalRules: PersonalRule[] = (ruleRows.data ?? []).map((r) => ({
    ruleKey: r.rule_key,
    ruleValue: (r.rule_value ?? {}) as Record<string, unknown>,
    confidence: Number(r.confidence),
  }))

  return {
    profile,
    goal,
    metrics,
    constraints,
    schedule,
    personalRules,
    aiProposal: readAiProposal(g.ai_proposal),
  }
}
