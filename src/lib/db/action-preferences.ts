// What the person wants from the model's suggestions.
//
// Insights lists what the AI proposed — Krafttraining, Laufen, eine Mahlzeit
// kochen — and until now that list was something to read, not something to
// answer: "dann möchte ich da aber Präferenzen geben, zum Beispiel möchte ich
// zweimal der Woche Krafttraining machen."
//
// The preference is a *request*. It changes what the engine is asked for, never
// what the engine is allowed to do: `withPreferences` narrows the proposal,
// `generatePlan` still decides which days survive the exclusions and the rest
// days, and `assertPlanInvariants` still refuses a week that breaks a limit.
// Somebody asking for five strength sessions gets as many as their week has
// room for, and the ones that do not fit simply are not planned.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { readActionPreferences } from './schemas'
import { MAX_TIMES_PER_WEEK } from '@/lib/engine/proposed'
import type { ActionPreference, ActionPreferences } from '@/lib/domain/types'

export type PreferenceResult = { ok: boolean; preferences: ActionPreferences }

/** Everything this person has asked for, on their active goal. */
export async function loadActionPreferences(profileId: string): Promise<ActionPreferences> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('goals')
    .select('action_preferences')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()

  return readActionPreferences(data?.action_preferences)
}

/**
 * Stores one wish, leaving the others alone.
 *
 * Read-modify-write on a jsonb object rather than a merge in SQL, because the
 * column is this person's own row and the only writer is this action. The read
 * validates what is already there, so a row that somehow holds nonsense is
 * repaired by the next write rather than carried forward.
 */
export async function setActionPreference(
  profileId: string,
  title: string,
  preference: ActionPreference,
): Promise<PreferenceResult> {
  const clamped: ActionPreference = {
    enabled: preference.enabled,
    timesPerWeek:
      preference.timesPerWeek === null
        ? null
        : Math.min(MAX_TIMES_PER_WEEK, Math.max(1, Math.round(preference.timesPerWeek))),
  }

  const supabase = await createClient()

  const { data: goal } = await supabase
    .from('goals')
    .select('id, action_preferences, ai_proposal')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()

  if (!goal) return { ok: false, preferences: {} }

  // Only for an action the model actually proposed. Without this the column
  // becomes a place to write arbitrary keys, and every one of them would be
  // read back on every plan.
  if (!proposedTitles(goal.ai_proposal).includes(title)) {
    return { ok: false, preferences: readActionPreferences(goal.action_preferences) }
  }

  const next: ActionPreferences = {
    ...readActionPreferences(goal.action_preferences),
    [title]: clamped,
  }

  const { error } = await supabase
    .from('goals')
    .update({ action_preferences: next })
    .eq('id', goal.id)
    .eq('profile_id', profileId)

  return error ? { ok: false, preferences: {} } : { ok: true, preferences: next }
}

/** The titles in the stored proposal, read defensively. */
function proposedTitles(proposal: unknown): string[] {
  if (!proposal || typeof proposal !== 'object') return []
  const actions = (proposal as { actions?: unknown }).actions
  if (!Array.isArray(actions)) return []

  return actions
    .map((a) => (a && typeof a === 'object' ? (a as { title?: unknown }).title : null))
    .filter((t): t is string => typeof t === 'string')
}
