// Asking what somebody's own training is worth — and remembering the answer.
//
// The engine used to decide this from a list: gym, bodyweight and climbing
// were "strength", running, cycling and swimming were "endurance". Plausible
// for an average, generic for everybody, and exactly what CLAUDE.md now
// forbids: a hardcoded table that decides something about a person.
//
// The judgement depends on the goal as much as on the sport — the same
// football training is a session for somebody chasing 10 km and a recovery
// cost for somebody chasing a deadlift — so it is stored on the goal, and it
// is asked again whenever the week it was made about changes.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import { WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import {
  commitmentsSignature, readCommitmentInsights,
} from '@/lib/domain/commitmentInsights'
import type { CommitmentInsight, PlanInput } from '@/lib/domain/types'

/**
 * How long the model gets. The same budget as the proposal: this shapes every
 * week from here on, and a judgement that times out leaves the app back on the
 * table it is meant to replace.
 */
const BUDGET_MS = 20_000

/**
 * The judgement for this goal, asking for one if the week has changed.
 *
 * Never throws: no consent, no key, a refusal, a failed safety check and a
 * timeout all end the same way — no judgement, and the activity tables decide,
 * which is the state the app was in before this existed.
 */
export async function ensureCommitmentInsights(
  profileId: string,
  input: PlanInput,
): Promise<CommitmentInsight[]> {
  try {
    return await run(profileId, input)
  } catch {
    return input.commitmentInsights ?? []
  }
}

async function run(profileId: string, input: PlanInput): Promise<CommitmentInsight[]> {
  const commitments = input.schedule.commitments
  if (commitments.length === 0) return []

  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id, commitment_insights, commitment_insights_for')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (!goal.data) return []

  const signature = commitmentsSignature(commitments)
  if (goal.data.commitment_insights_for === signature) {
    return readCommitmentInsights(goal.data.commitment_insights)
  }

  const adapter = await adapterFor(profileId, BUDGET_MS)
  const result = await adapter.judgeCommitments(contextFor(input))

  // Nothing written on a failure, deliberately: the previous judgement — which
  // may still be right about most of the week — stays where it is rather than
  // being replaced by nothing because a provider was down.
  if (!result.ok) return readCommitmentInsights(goal.data.commitment_insights)

  const insights = result.value.insights

  await supabase
    .from('goals')
    .update({
      commitment_insights: insights as unknown as never,
      commitment_insights_for: signature,
    })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)

  return insights
}

/**
 * What the model may see. Deliberately coarse, like every other context that
 * leaves this machine: the label, the day, the length and the sport — enough
 * to judge a training session, and nothing that identifies a person.
 */
function contextFor(input: PlanInput) {
  return {
    goalText: input.goal.rawText,
    archetype: input.goal.archetype,
    planWouldPlan: PLANS_FOR[input.goal.archetype] ?? 'Aktionen für dieses Ziel',
    experience: input.profile.sport.experience ?? 'nicht angegeben',
    commitments: input.schedule.commitments.map((c) => ({
      label: c.label,
      weekday: WEEKDAY_LABELS[c.weekday],
      minutes: c.minutes,
      activity: c.activity,
    })),
    disliked: input.profile.sport.dislikedActivities,
  }
}

/**
 * What the goal track would otherwise plan, in the words the model needs to
 * judge against it. Without this the question "does this replace a session"
 * has no session to compare to.
 */
const PLANS_FOR: Record<string, string> = {
  body_composition: 'Krafttraining, um im Defizit Muskeln zu halten',
  strength: 'Krafteinheiten nach Muskelgruppen',
  endurance: 'strukturierte Läufe mit langsam steigendem Umfang',
  sleep_recovery: 'ruhige Abende und feste Schlafzeiten',
  nutrition_quality: 'konkrete Ernährungsgewohnheiten',
  habit_routine: 'eine neue Gewohnheit zur Zeit',
  general_health: 'eine Gesundheitsbasis aus Bewegung, Schlaf und Ernährung',
}
