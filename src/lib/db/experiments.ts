// Experiments, from proposal to a rule that changes the next plan.
//
// This is the last stretch of the cycle in docs/ADAPTIVE_ENGINE.md, and the
// only path by which anything is allowed to enter the personal model. Plan care
// never writes here, a hypothesis never writes here, and a declined proposal
// never writes here (ADR-013).
//
// The gate that matters is what an experiment is judged on. Evaluation takes a
// BehaviorMetric whose class is a literal type, the measurements table stores a
// metric_class, and experiment_results carries a CHECK constraint refusing
// anything but 'behavior'. Three layers saying the same thing, because a rule
// derived from two weeks of weight would be a rule derived from noise — and it
// would stay in the model, quietly wrong, for months.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadObservations } from './analysis'
import {
  applyDecision, completionRate, derivePersonalRule, evaluateExperiment,
  type BehaviorMetric, type Evaluation, type Experiment,
} from '@/lib/adaptive'
import { MIN_RULE_CONFIDENCE } from '@/lib/adaptive/constants'

export type StoredExperiment = Experiment & { id: string }

/** The proposal the user accepted. Stored as running, with its baseline fixed. */
export async function acceptExperiment(
  profileId: string,
  experiment: Experiment,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()

  const goal = await supabase
    .from('goals')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (!goal.data) return { ok: false }

  // One at a time. Two concurrent experiments make both results unreadable,
  // and the engine already refuses to propose a second — this is the same rule
  // enforced where it cannot be talked around.
  const running = await supabase
    .from('experiments')
    .select('id')
    .eq('profile_id', profileId)
    .in('status', ['proposed', 'running'])
    .limit(1)
  if ((running.data ?? []).length > 0) return { ok: false }

  const { error } = await supabase.from('experiments').insert({
    profile_id: profileId,
    goal_id: goal.data.id,
    hypothesis: experiment.hypothesis,
    variable: experiment.variable,
    change_description: experiment.changeDescription,
    // The rule travels with the experiment, so adoption cannot invent a
    // different change from the one that was actually tested.
    baseline: {
      metricKey: experiment.baseline.metricKey,
      value: experiment.baseline.value,
      proposedRule: experiment.proposedRule,
      evidence: experiment.evidence,
    },
    metric_key: experiment.metricKey,
    start_date: experiment.startDate,
    end_date: experiment.endDate,
    status: 'running',
  })

  return { ok: error === null }
}

/** Declining is data too: it says this change was wrong for this person. */
export async function declineExperiment(
  profileId: string,
  experiment: Experiment,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (!goal.data) return { ok: false }

  const { error } = await supabase.from('experiments').insert({
    profile_id: profileId,
    goal_id: goal.data.id,
    hypothesis: experiment.hypothesis,
    variable: experiment.variable,
    change_description: experiment.changeDescription,
    baseline: {
      metricKey: experiment.baseline.metricKey,
      value: experiment.baseline.value,
      proposedRule: experiment.proposedRule,
      evidence: experiment.evidence,
    },
    metric_key: experiment.metricKey,
    start_date: experiment.startDate,
    end_date: experiment.endDate,
    status: 'rejected',
  })
  return { ok: error === null }
}

export type RunningExperiment = {
  id: string
  hypothesis: string
  changeDescription: string
  variable: string
  metricKey: string
  startDate: string
  endDate: string
  baselineValue: number
  proposedRule: { ruleKey: string; ruleValue: Record<string, unknown> }
}

export async function loadRunningExperiment(
  profileId: string,
): Promise<RunningExperiment | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('experiments')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'running')
    .order('start_date', { ascending: false })
    .maybeSingle()

  if (!data) return null

  const baseline = (data.baseline ?? {}) as {
    value?: number
    proposedRule?: { ruleKey: string; ruleValue: Record<string, unknown> }
  }
  if (typeof baseline.value !== 'number' || !baseline.proposedRule) return null

  return {
    id: data.id,
    hypothesis: data.hypothesis,
    changeDescription: data.change_description,
    variable: data.variable,
    metricKey: data.metric_key,
    startDate: data.start_date,
    endDate: data.end_date,
    baselineValue: baseline.value,
    proposedRule: baseline.proposedRule,
  }
}

export type ConcludedExperiment = {
  hypothesis: string
  evaluation: Evaluation
  ruleWritten: boolean
}

/**
 * Evaluates a running experiment once its period has passed. Returns null while
 * it is still running — there is nothing to say yet, and saying something
 * anyway is how a system ends up confidently wrong.
 */
export async function concludeIfDue(
  profileId: string,
  today: string,
): Promise<ConcludedExperiment | null> {
  const running = await loadRunningExperiment(profileId)
  if (!running || today <= running.endDate) return null

  const observations = await loadObservations(profileId, today, 12)
  const during = observations.filter(
    (o) => o.scheduledOn >= running.startDate && o.scheduledOn <= running.endDate,
  )

  const observed = completionRate(during)
  const resolved = during.filter(
    (o) => o.status === 'done' || o.status === 'moved' || o.status === 'missed',
  ).length

  // A behaviour metric by construction. There is no branch here that could
  // accidentally pass a weight.
  const metric: BehaviorMetric = {
    metricKey: running.metricKey,
    metricClass: 'behavior',
    value: observed ?? running.baselineValue,
  }

  const experiment: Experiment = {
    hypothesis: running.hypothesis,
    variable: running.variable,
    changeDescription: running.changeDescription,
    proposedRule: running.proposedRule,
    baseline: {
      metricKey: running.metricKey,
      metricClass: 'behavior',
      value: running.baselineValue,
    },
    metricKey: running.metricKey,
    startDate: running.startDate,
    endDate: running.endDate,
    status: 'running',
    evidence: [],
  }

  const evaluation = evaluateExperiment(experiment, metric, resolved)
  const concluded = applyDecision(experiment, evaluation)

  const supabase = await createClient()
  await supabase
    .from('experiments')
    .update({ status: concluded.status })
    .eq('id', running.id)
    .eq('profile_id', profileId)

  await supabase.from('experiment_results').insert({
    experiment_id: running.id,
    profile_id: profileId,
    metric: running.metricKey,
    metric_class: 'behavior',
    baseline_value: running.baselineValue,
    observed_value: metric.value,
    decision: evaluation.decision,
  })

  const rule = derivePersonalRule(concluded, evaluation)
  if (rule) {
    await supabase.from('personal_rules').upsert(
      {
        profile_id: profileId,
        rule_key: rule.ruleKey,
        rule_value: rule.ruleValue,
        confidence: rule.confidence,
        source_experiment_id: running.id,
        active: true,
      },
      { onConflict: 'profile_id,rule_key' },
    )
  }

  await supabase.from('insights').insert({
    profile_id: profileId,
    kind: 'experiment_result',
    statement: evaluation.reason,
    // Non-empty by construction; the database rejects an insight without it.
    evidence: [{ experimentId: running.id, decision: evaluation.decision }],
  })

  return { hypothesis: running.hypothesis, evaluation, ruleWritten: rule !== null }
}

export type LearnedRule = {
  ruleKey: string
  ruleValue: Record<string, unknown>
  confidence: number
  createdAt: string
}

/** The personal model, as the Playbook screen shows it. */
export async function loadPersonalRules(profileId: string): Promise<LearnedRule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('personal_rules')
    .select('*')
    .eq('profile_id', profileId)
    .eq('active', true)
    .gte('confidence', MIN_RULE_CONFIDENCE)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => ({
    ruleKey: row.rule_key,
    ruleValue: (row.rule_value ?? {}) as Record<string, unknown>,
    confidence: Number(row.confidence),
    createdAt: row.created_at,
  }))
}
