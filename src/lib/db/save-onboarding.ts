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
import { scheduleRow } from './schedule-row'
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
    { profile_id: profileId, ...scheduleRow(data.schedule) },
    { onConflict: 'profile_id' },
  )
  if (schedule.error) return { ok: false, error: schedule.error.message }

  // Build first, destroy last.
  //
  // This used to run the other way round: clear the constraints, pause the old
  // goal, abort its experiments, and only then insert the new goal. Any failure
  // in between left someone with no active goal and no constraints, and the app
  // then sends a person with no goal straight back into the onboarding — which
  // is exactly the "das Onboarding kommt schon wieder" symptom, arriving from
  // the data layer rather than from the routing.
  //
  // PostgREST gives each statement its own transaction, so the ordering *is*
  // the safety property here. Nothing the person already has is removed until
  // its replacement exists in the database.

  // The new goal goes in paused, so it does not collide with the active one
  // under goals_one_active_per_profile. If this fails — a target date the
  // calendar does not have, a classifier value the enum rejects — the person
  // still has everything they had a second ago.
  const goal = await supabase
    .from('goals')
    .insert({
      profile_id: profileId,
      raw_text: data.goal.rawText,
      archetype: data.goal.archetype,
      classified_by: data.goal.classifiedBy,
      target_date: data.goal.targetDate,
      status: 'paused',
    })
    .select('id')
    .single()
  if (goal.error) return { ok: false, error: goal.error.message }

  /** Undo the half-built goal, so a failure leaves no orphan behind. */
  const rollback = async (message: string): Promise<SaveResult> => {
    await supabase.from('goals').delete().eq('id', goal.data.id).eq('profile_id', profileId)
    return { ok: false, error: message }
  }

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
    if (metrics.error) return rollback(metrics.error.message)
  }

  // Constraints are replaced wholesale — they come from one pass through the
  // onboarding, so anything absent now was deliberately removed. The old rows
  // are noted first and deleted last, so there is no moment where someone has
  // none: a hard constraint is the difference between a safe plan and an
  // injury, and losing one silently is not an acceptable failure mode.
  const existing = await supabase.from('constraints').select('id').eq('profile_id', profileId)
  if (existing.error) return rollback(existing.error.message)

  if (data.constraints.length > 0) {
    const inserted = await supabase.from('constraints').insert(
      data.constraints.map((c) => ({
        profile_id: profileId,
        kind: c.kind,
        hard: c.hard,
        value: c.value,
      })),
    )
    if (inserted.error) return rollback(inserted.error.message)
  }

  const staleIds = (existing.data ?? []).map((row) => row.id)
  if (staleIds.length > 0) {
    const cleared = await supabase
      .from('constraints')
      .delete()
      .eq('profile_id', profileId)
      .in('id', staleIds)
    if (cleared.error) return rollback(cleared.error.message)
  }

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
  if (aborted.error) return rollback(aborted.error.message)

  const clearedTrials = await supabase
    .from('personal_rules')
    .delete()
    .eq('profile_id', profileId)
    .eq('trial', true)
  if (clearedTrials.error) return rollback(clearedTrials.error.message)

  // The handover, and the only genuinely destructive pair. Retired, never
  // deleted: an old goal is part of this person's history, and the plans and
  // experiments that reference it must stay readable.
  const retired = await supabase
    .from('goals')
    .update({ status: 'paused' })
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (retired.error) return rollback(retired.error.message)

  const activated = await supabase
    .from('goals')
    .update({ status: 'active' })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)
  // Nothing to roll back to here — the old goal is already paused — so the
  // new one stays as the only candidate and the error is reported honestly.
  if (activated.error) return { ok: false, error: activated.error.message }

  // Weight is an outcome metric, so its history belongs in measurements. The
  // profile keeps only the starting point.
  if (data.profile.weightKg !== null) {
    // Checked like everything else. It was the one write in this function whose
    // error was discarded, which is how a starting weight disappears without
    // anyone finding out until the first chart looks wrong.
    const measured = await supabase.from('measurements').insert({
      profile_id: profileId,
      metric_key: 'weight_kg',
      metric_class: 'outcome',
      value: data.profile.weightKg,
      unit: 'kg',
    })
    if (measured.error) return { ok: false, error: measured.error.message }
  }

  return { ok: true }
}
