// Writing a finished onboarding.
//
// Every write is scoped to the signed-in user's own id, which row level
// security also enforces independently — the id is never taken from the client.
//
// Ordering matters: the profile row must exist before anything referencing it,
// and the previous active goal has to be retired before the new one is inserted.
// A partial unique index allows exactly one active goal per profile (ADR-004),
// so inserting first would be rejected by the database. That rejection is the
// system working; this function simply avoids provoking it.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Constraint, Goal, GoalMetric, Profile, Schedule } from '@/lib/domain/types'

export type OnboardingData = {
  profile: Profile
  goal: Goal
  metrics: GoalMetric[]
  schedule: Schedule
  constraints: Constraint[]
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveOnboarding(
  profileId: string,
  data: OnboardingData,
): Promise<SaveResult> {
  const supabase = await createClient()

  const profile = await supabase.from('profiles').upsert({
    id: profileId,
    birth_year: data.profile.birthYear,
    height_cm: data.profile.heightCm,
    weight_kg: data.profile.weightKg,
    sex_at_birth: data.profile.sexAtBirth,
    sport: data.profile.sport,
    nutrition: data.profile.nutrition,
    sleep: data.profile.sleep,
    mind: data.profile.mind,
    onboarding_stage: 2,
  })
  if (profile.error) return { ok: false, error: profile.error.message }

  const schedule = await supabase.from('schedules').upsert(
    {
      profile_id: profileId,
      work_pattern: data.schedule.workPattern,
      free_slots: data.schedule.freeSlots,
      commitments: data.schedule.commitments,
    },
    { onConflict: 'profile_id' },
  )
  if (schedule.error) return { ok: false, error: schedule.error.message }

  // Replaced wholesale rather than merged: these come from one pass through the
  // onboarding, so anything absent now was deliberately removed.
  const clearedConstraints = await supabase
    .from('constraints')
    .delete()
    .eq('profile_id', profileId)
  if (clearedConstraints.error) return { ok: false, error: clearedConstraints.error.message }

  if (data.constraints.length > 0) {
    const inserted = await supabase.from('constraints').insert(
      data.constraints.map((c) => ({
        profile_id: profileId,
        kind: c.kind,
        hard: c.hard,
        value: c.value,
      })),
    )
    if (inserted.error) return { ok: false, error: inserted.error.message }
  }

  // Retired, never deleted: an old goal is part of this person's history, and
  // the plans and experiments that reference it must stay readable.
  const retired = await supabase
    .from('goals')
    .update({ status: 'paused' })
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (retired.error) return { ok: false, error: retired.error.message }

  // An experiment belongs to the goal it was run for. Left open it would block
  // every future experiment — only one may be open at a time — and its trial
  // rule would keep shaping plans for a goal nobody is pursuing any more. It
  // cannot be concluded either: the period it was measuring was interrupted,
  // so there is no honest result to record.
  const aborted = await supabase
    .from('experiments')
    .update({ status: 'aborted' })
    .eq('profile_id', profileId)
    .in('status', ['proposed', 'running', 'extended'])
  if (aborted.error) return { ok: false, error: aborted.error.message }

  const clearedTrials = await supabase
    .from('personal_rules')
    .delete()
    .eq('profile_id', profileId)
    .eq('trial', true)
  if (clearedTrials.error) return { ok: false, error: clearedTrials.error.message }

  const goal = await supabase
    .from('goals')
    .insert({
      profile_id: profileId,
      raw_text: data.goal.rawText,
      archetype: data.goal.archetype,
      classified_by: data.goal.classifiedBy,
      target_date: data.goal.targetDate,
      status: 'active',
    })
    .select('id')
    .single()
  if (goal.error) return { ok: false, error: goal.error.message }

  const withValues = data.metrics.filter(
    (m) => m.startValue !== null && m.targetValue !== null,
  )
  if (withValues.length > 0) {
    const metrics = await supabase.from('goal_metrics').insert(
      withValues.map((m) => ({
        goal_id: goal.data.id,
        profile_id: profileId,
        metric_key: m.metricKey,
        start_value: m.startValue as number,
        target_value: m.targetValue as number,
        unit: m.unit,
      })),
    )
    if (metrics.error) return { ok: false, error: metrics.error.message }
  }

  // Weight is an outcome metric, so its history belongs in measurements. The
  // profile keeps only the starting point.
  if (data.profile.weightKg !== null) {
    await supabase.from('measurements').insert({
      profile_id: profileId,
      metric_key: 'weight_kg',
      metric_class: 'outcome',
      value: data.profile.weightKg,
      unit: 'kg',
    })
  }

  return { ok: true }
}
