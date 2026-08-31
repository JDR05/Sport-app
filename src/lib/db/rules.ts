// Re-checking the personal model against what has happened since.
//
// ADR-033 said rules have to be able to weaken. The pure functions for it —
// reinforce, activeRules, mergeRule — were written and tested in Schritt 6 and
// then never called from anywhere in the product. Confidence entered the model
// at 0.6 and stayed there for ever, which made the Playbook's own sentence
// ("sie kann wieder sinken, wenn es später anders läuft") untrue of anything
// the code did.
//
// Run once a week, at the moment a new week is materialised. That is naturally
// the right cadence and needs no bookkeeping column: the partial unique index
// on plans already guarantees a week is built exactly once.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadObservations } from './analysis'
import { fadedStatement, recheckRules, reinforce } from '@/lib/adaptive'
import { MIN_RULE_CONFIDENCE } from '@/lib/adaptive/constants'
import type { PersonalRule } from '@/lib/domain/types'

export type RecheckOutcome = {
  /** Rules whose confidence moved, with the direction. */
  moved: Array<{ ruleKey: string; from: number; to: number }>
  /** Rules that dropped below the threshold and stopped being applied. */
  faded: string[]
}

const NOTHING: RecheckOutcome = { moved: [], faded: [] }

/**
 * Never throws and never returns null for a failure. Nothing here is worth a
 * person not seeing their week — a re-check that did not happen simply happens
 * next week instead.
 */
export async function recheckPersonalRules(
  profileId: string,
  today: string,
): Promise<RecheckOutcome> {
  try {
    return await run(profileId, today)
  } catch {
    return NOTHING
  }
}

async function run(profileId: string, today: string): Promise<RecheckOutcome> {
  const supabase = await createClient()

  // Trial rules are excluded: one is the subject of a running experiment, and
  // that experiment is what decides it. Two mechanisms judging the same rule
  // would make both results unreadable.
  const stored = await supabase
    .from('personal_rules')
    .select('*')
    .eq('profile_id', profileId)
    .eq('active', true)
    .eq('trial', false)

  if (stored.error || !stored.data || stored.data.length === 0) return NOTHING

  const rules: Array<PersonalRule & { id: string }> = stored.data.map((row) => ({
    id: row.id,
    ruleKey: row.rule_key,
    ruleValue: (row.rule_value ?? {}) as Record<string, unknown>,
    confidence: Number(row.confidence),
  }))

  const observations = await loadObservations(profileId, today)
  const verdicts = recheckRules(rules, observations)

  const outcome: RecheckOutcome = { moved: [], faded: [] }

  for (const [index, verdict] of verdicts.entries()) {
    // The common case, and it is a real answer: the weeks said nothing either
    // way, so the belief is left exactly as it was.
    if (verdict.agrees === null) continue

    const rule = rules[index]
    const next = reinforce(rule, verdict.agrees)
    if (next.confidence === rule.confidence) continue

    const written = await supabase
      .from('personal_rules')
      .update({ confidence: next.confidence })
      .eq('id', rule.id)
      .eq('profile_id', profileId)
      .select('id')

    if (written.error || (written.data ?? []).length === 0) continue

    outcome.moved.push({ ruleKey: rule.ruleKey, from: rule.confidence, to: next.confidence })

    // Crossing the line is worth saying out loud. A rule that quietly stops
    // applying would leave the person with a plan that changed shape for no
    // reason they were ever told — and the Playbook still listing a rule the
    // planner no longer follows.
    if (rule.confidence >= MIN_RULE_CONFIDENCE && next.confidence < MIN_RULE_CONFIDENCE) {
      outcome.faded.push(rule.ruleKey)
      await supabase.from('insights').insert({
        profile_id: profileId,
        kind: 'pattern',
        statement: fadedStatement(rule.ruleKey),
        evidence: [
          {
            ruleKey: rule.ruleKey,
            onRule: verdict.onRule,
            elsewhere: verdict.elsewhere,
            resolved: verdict.resolved,
          },
        ],
      })
    }
  }

  return outcome
}
