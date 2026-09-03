// The app taking an interest.
//
// The model asks once, after the intake, and then never again (ADR-084).
// Everything after that the app has to infer from ticks — so a person's actual
// life reaches it only if they think to type it in.
//
// Three things make this an interest rather than an interview, and each is
// enforced somewhere it cannot be forgotten:
//
//   * At most one open question, by a partial unique index in Postgres.
//   * A gap between questions and a weekly ceiling, by a pure function that
//     runs before anything is sent (`mayAskFollowUp`).
//   * A question that could have been asked before anything happened is
//     refused by the same gate the intake step uses — it may not ask what the
//     onboarding already knows.
//
// And the answer has to go somewhere: it is appended to the goal's intake
// answers, which is what the plan is built from. A question whose answer
// changes nothing is a survey.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import { knownFields, openFields } from '@/lib/ai/tasks'
import { mayAskFollowUp } from '@/lib/adaptive/followup'
import { REASON_LABELS } from '@/lib/adaptive/reaction'
import { DOMAIN_LABELS, SLOT_LABELS, WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { weekScores } from '@/lib/adaptive/scores'
import { startOfWeek } from '@/lib/engine/dates'
import { countDaysWithData, weeklyReview } from './analysis'
import { loadCheckIns } from './tracking'
import { loadCommitments } from './commitments'
import { loadPlanInput } from './plan-input'
import { weekReasons } from './reaction'
import type { Deviation } from '@/lib/adaptive'
import type { IntakeAnswer, PlanDomain } from '@/lib/domain/types'

/**
 * How long the model gets. The same budget the intake questions use, and for
 * the same reason: this is the step that is the whole point, and cutting it
 * short looks from outside exactly like a model with nothing to ask.
 */
const FOLLOWUP_BUDGET_MS = 20_000

/** A question waiting for an answer. */
export type OpenQuestion = {
  id: string
  question: string
  why: string
  options: string[]
  askedOn: string
}

/**
 * The open question, asking a new one first if that is allowed.
 *
 * Never throws. No consent, no key, a refusal, a failed safety check, a
 * timeout and "the model had nothing to ask" all end the same way: no
 * question, and the app carries on planning from what it already has.
 */
export async function ensureFollowUp(
  profileId: string,
  today: string,
): Promise<OpenQuestion | null> {
  try {
    return await run(profileId, today)
  } catch {
    return null
  }
}

async function run(profileId: string, today: string): Promise<OpenQuestion | null> {
  const open = await loadOpenQuestion(profileId)
  // Answer the one you have before being handed another.
  if (open) return open

  // The cheap reads first: this runs on every load of Today, and on most of
  // them the honest answer is "not now".
  const [lastAsked, askedThisWeek, daysWithData] = await Promise.all([
    lastAskedOn(profileId),
    countAskedSince(profileId, startOfWeek(today)),
    countDaysWithData(profileId),
  ])

  const verdict = mayAskFollowUp({
    today,
    hasOpenQuestion: false,
    daysWithData,
    lastAskedOn: lastAsked,
    askedThisWeek,
  })
  if (!verdict.mayAsk) return null

  const context = await buildContext(profileId, today)
  if (!context) return null

  const adapter = await adapterFor(profileId, FOLLOWUP_BUDGET_MS)
  const result = await adapter.followUp(context)

  // Nothing came back, or the model had nothing worth asking. Deliberately not
  // recorded: an attempt is not a question, and counting it against the weekly
  // ceiling would let a provider outage buy the app a week of silence.
  if (!result.ok || !result.value.needsMore) return null

  const asked = result.value.questions[0]
  if (!asked) return null

  return store(profileId, today, {
    question: asked.question,
    why: asked.why,
    options: asked.options,
    source: adapter.name,
  })
}

export async function loadOpenQuestion(profileId: string): Promise<OpenQuestion | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_questions')
    .select('id, question, why, options, asked_on')
    .eq('profile_id', profileId)
    .is('answered_on', null)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    question: data.question,
    why: data.why,
    options: Array.isArray(data.options) ? (data.options as string[]) : [],
    askedOn: data.asked_on,
  }
}

/**
 * Records the answer, and — the part that makes this worth interrupting
 * somebody for — puts it where the plan is built from.
 *
 * A skip is a resolution too, and is kept as one. "Was asked, chose not to
 * say" is information, the same way `unknown` is everywhere else in this
 * product, and losing it would let the app ask the same thing again next week
 * as though it never had.
 */
export async function answerFollowUp(
  profileId: string,
  questionId: string,
  answer: string | null,
  today: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()

  const text = answer?.trim().slice(0, 300) ?? null
  const skipped = text === null || text.length === 0

  const { data, error } = await supabase
    .from('app_questions')
    .update({
      answer: skipped ? null : text,
      skipped,
      answered_on: today,
    })
    .eq('id', questionId)
    .eq('profile_id', profileId)
    // Only an open one. Re-answering a resolved question would rewrite what
    // the plan was built from, days later, from a screen that should no longer
    // be showing it.
    .is('answered_on', null)
    .select('question')
    .maybeSingle()

  if (error || !data) return { ok: false }

  // A skip changes nothing about the plan, so nothing is written to the goal.
  if (!skipped) await appendIntakeAnswer(profileId, data.question, text)

  return { ok: true }
}

/**
 * Adds one answer to what the plan reads, without disturbing the others.
 *
 * Read-modify-write on a jsonb array, which is the shape the column already
 * has. Two answers arriving at once could lose one — and that is acceptable
 * here in a way it would not be for a status: the app asks at most one
 * question at a time, so two concurrent answers mean the same person tapped
 * twice.
 */
async function appendIntakeAnswer(
  profileId: string,
  question: string,
  answer: string | null,
): Promise<void> {
  const supabase = await createClient()

  const goal = await supabase
    .from('goals')
    .select('id, intake_answers')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()

  if (!goal.data) return

  const existing: IntakeAnswer[] = Array.isArray(goal.data.intake_answers)
    ? (goal.data.intake_answers as unknown as IntakeAnswer[])
    : []

  await supabase
    .from('goals')
    .update({
      intake_answers: [...existing, { question, answer }] as unknown as never,
    })
    .eq('id', goal.data.id)
    .eq('profile_id', profileId)
}

async function store(
  profileId: string,
  today: string,
  row: { question: string; why: string; options: string[]; source: string },
): Promise<OpenQuestion | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('app_questions')
    .insert({
      profile_id: profileId,
      asked_on: today,
      question: row.question,
      why: row.why,
      options: row.options,
      source: row.source,
    })
    .select('id')
    .single()

  // A lost race is fine and is the index doing its job: somebody else's
  // request already put a question there, and one is the limit.
  if (error || !data) return loadOpenQuestion(profileId)

  return { id: data.id, question: row.question, why: row.why, options: row.options, askedOn: today }
}

async function lastAskedOn(profileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_questions')
    .select('asked_on')
    .eq('profile_id', profileId)
    .order('asked_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.asked_on ?? null
}

async function countAskedSince(profileId: string, since: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('app_questions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .gte('asked_on', since)
  return count ?? 0
}

/** Every question the app has ever asked, so it cannot ask one twice. */
async function previouslyAsked(profileId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_questions')
    .select('question')
    .eq('profile_id', profileId)
    .order('asked_on', { ascending: false })
    .limit(20)
  return (data ?? []).map((row) => row.question)
}

async function buildContext(profileId: string, today: string) {
  const weekStart = startOfWeek(today)

  const [input, review, reasons, checkIns, commitments, asked] = await Promise.all([
    loadPlanInput(profileId),
    weeklyReview(profileId, today),
    weekReasons(profileId, weekStart),
    loadCheckIns(profileId, weekStart),
    loadCommitments(profileId),
    previouslyAsked(profileId),
  ])
  if (!input) return null

  const scores = review ? weekScores(review.thisWeek) : null
  const withToday = { ...input, today }

  return {
    goalText: input.goal.rawText,
    archetype: input.goal.archetype,
    known: knownFields(withToday),
    open: openFields(withToday),
    completion:
      scores?.domains.map((d) => ({
        domain: DOMAIN_LABELS[d.domain] ?? d.domain,
        done: d.done,
        resolved: d.resolved,
      })) ?? [],
    reasons: reasons.counts.map(
      (c) =>
        `${REASON_LABELS[c.reason]} — ${c.count}× bei ${DOMAIN_LABELS[c.domain as PlanDomain] ?? c.domain}`,
    ),
    deviations: (review?.analysis.deviations ?? []).map(describeDeviation),
    commitments: commitments.map(
      (c) => `${WEEKDAY_LABELS[c.weekday]} ${c.start}, ${c.minutes} min: ${c.label}`,
    ),
    notes: [
      ...checkIns
        .filter((c) => c.note !== null && c.note.trim().length > 0)
        .map((c) => ({ date: c.checkedInOn, text: c.note!.trim().slice(0, 300) })),
      ...reasons.notes,
    ].sort((a, b) => a.date.localeCompare(b.date)),
    alreadyAsked: asked,
  }
}

/** The same sentence Insights shows, so a question cannot contradict the screen. */
function describeDeviation(d: Deviation): string {
  const where =
    d.dimension === 'weekday'
      ? (WEEKDAY_LABELS[d.bucket as keyof typeof WEEKDAY_LABELS] ?? d.bucket)
      : d.dimension === 'time_slot'
        ? (SLOT_LABELS[d.bucket as keyof typeof SLOT_LABELS] ?? d.bucket)
        : d.dimension === 'domain'
          ? (DOMAIN_LABELS[d.bucket as keyof typeof DOMAIN_LABELS] ?? d.bucket)
          : d.bucket
  return `${where}: ${d.missed} von ${d.resolved} ausgefallen`
}
