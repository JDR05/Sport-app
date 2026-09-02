// The question box, server side.
//
// Four things happen here in a fixed order, and the order is the safety
// property: the allowance is checked before anything is sent, the context is
// assembled from the database rather than from the request, the answer goes
// through the same gate as every other AI output, and only then is anything
// written down.
//
// The context is assembled here and not passed in for the same reason
// `applyCorrections` recomputes its patch: a request that carries the data the
// model reasons over is a request that can choose what the model believes.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import { allowanceFor, normaliseQuestion, suggestionsFor, type Suggestion } from '@/lib/ai/ask'
import { REASON_LABELS } from '@/lib/adaptive/reaction'
import { DOMAIN_LABELS, SLOT_LABELS, WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { weekScores } from '@/lib/adaptive/scores'
import { addDays, startOfWeek } from '@/lib/engine/dates'
import { loadCheckIns } from './tracking'
import { loadPlanInput } from './plan-input'
import { loadWeekItems, weeklyReview } from './analysis'
import { fromRow, type ItemRow } from './item-mapping'
import { weekReasons } from './reaction'
import type { Deviation } from '@/lib/adaptive'
import type { PlanDomain } from '@/lib/domain/types'

/** One exchange, as the screen shows it. */
export type Exchange = {
  id: string
  question: string
  canAnswer: boolean
  answer: string
  needs: string | null
  evidence: string[]
}

export type AskState = {
  /** False when nothing can answer — no key, or no consent. The box is hidden. */
  available: boolean
  /** Today's exchanges, oldest first. */
  history: Exchange[]
  /** Tappable openers, from this person's actual week. */
  suggestions: Suggestion[]
  /** Null while there are questions left; the reason when there are not. */
  exhausted: string | null
}

export type AskResult =
  | { ok: true; exchange: Exchange }
  | { ok: false; reason: 'limit' | 'invalid' | 'no_answer'; message: string }

/**
 * What the Today screen needs to draw the box, in one round trip's worth of
 * reads.
 *
 * Returns `available: false` rather than throwing when there is no model: the
 * screen then shows nothing at all, which is the honest outcome. An input
 * field that answers "das kann ich nicht" to everything is worse than no input
 * field.
 */
export async function askState(profileId: string, today: string): Promise<AskState> {
  const adapter = await adapterFor(profileId)

  const [history, week] = await Promise.all([
    todaysExchanges(profileId, today),
    loadWeekItems(profileId, startOfWeek(today)),
  ])

  const allowance = allowanceFor(history.length)

  return {
    // `usesModel` and not `name`: the deterministic adapters answer nothing
    // here, and offering a box in front of them would be a lie in the shape of
    // a text field.
    available: adapter.usesModel,
    history,
    suggestions: suggestionsFor({
      todayTitles: week.filter((i) => i.scheduledOn === today).map((i) => i.title),
      missedDomains: [
        ...new Set(week.filter((i) => i.status === 'missed').map((i) => i.domain)),
      ] as PlanDomain[],
      hasWeekData: week.some((i) => i.status === 'done' || i.status === 'missed'),
    }),
    exhausted: allowance.allowed ? null : allowance.message,
  }
}

/**
 * One question, one answer, written down.
 *
 * The allowance is counted from the database and not from anything the client
 * says. Five a day is a product rule, and a rule enforced by a number held in
 * a browser is a suggestion.
 */
export async function askQuestion(
  profileId: string,
  rawQuestion: unknown,
  today: string,
): Promise<AskResult> {
  const question = normaliseQuestion(rawQuestion)
  if (!question) {
    return { ok: false, reason: 'invalid', message: 'Das war zu kurz für eine Frage.' }
  }

  const asked = await todaysExchanges(profileId, today)
  const allowance = allowanceFor(asked.length)
  if (!allowance.allowed) return { ok: false, reason: 'limit', message: allowance.message }

  const context = await buildContext(profileId, question, today, asked)
  if (!context) {
    return {
      ok: false,
      reason: 'no_answer',
      message: 'Dafür fehlt mir noch dein Ziel. Leg zuerst eines an.',
    }
  }

  const adapter = await adapterFor(profileId)
  const result = await adapter.ask(context)

  if (!result.ok) {
    // Deliberately not written down. A failed call is not an exchange, and
    // counting it against the day's five would punish somebody for the
    // provider being slow.
    return {
      ok: false,
      reason: 'no_answer',
      message: 'Darauf habe ich gerade keine Antwort bekommen. Versuch es später noch einmal.',
    }
  }

  const value = result.value
  const stored = await store(profileId, today, {
    question,
    canAnswer: value.canAnswer,
    answer: value.answer,
    needs: value.needs,
    evidence: value.basedOn,
    source: adapter.name,
  })

  if (!stored) {
    return {
      ok: false,
      reason: 'no_answer',
      message: 'Die Antwort konnte nicht gespeichert werden.',
    }
  }

  return { ok: true, exchange: stored }
}

async function todaysExchanges(profileId: string, today: string): Promise<Exchange[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ai_questions')
    .select('id, question, can_answer, answer, needs, evidence')
    .eq('profile_id', profileId)
    .eq('asked_on', today)
    .order('created_at', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    question: row.question,
    canAnswer: row.can_answer,
    answer: row.answer,
    needs: row.needs,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
  }))
}

async function store(
  profileId: string,
  today: string,
  row: {
    question: string
    canAnswer: boolean
    answer: string
    needs: string | null
    evidence: string[]
    source: string
  },
): Promise<Exchange | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_questions')
    .insert({
      profile_id: profileId,
      asked_on: today,
      question: row.question,
      can_answer: row.canAnswer,
      answer: row.answer,
      needs: row.needs,
      evidence: row.evidence,
      source: row.source,
    })
    .select('id')
    .single()

  if (error || !data) return null
  return {
    id: data.id,
    question: row.question,
    canAnswer: row.canAnswer,
    answer: row.answer,
    needs: row.needs,
    evidence: row.evidence,
  }
}

/**
 * Everything the model is allowed to see, from this person's own rows.
 *
 * Wider than the weekly note's context because a question can be about
 * anything; narrower than the database because this is health data leaving the
 * building. Every field here is the answer to a question people actually ask.
 */
async function buildContext(
  profileId: string,
  question: string,
  today: string,
  history: Exchange[],
) {
  const weekStart = startOfWeek(today)

  const [input, review, week, todayItems, reasons, checkIns] = await Promise.all([
    loadPlanInput(profileId),
    weeklyReview(profileId, today),
    loadWeekItems(profileId, weekStart),
    loadDay(profileId, today),
    weekReasons(profileId, weekStart),
    loadCheckIns(profileId, weekStart),
  ])
  if (!input) return null

  const scores = review ? weekScores(review.thisWeek) : null

  return {
    question,
    goalText: input.goal.rawText,
    archetype: input.goal.archetype,
    today,
    todayItems: todayItems.map((i) => ({
      title: i.title,
      domain: DOMAIN_LABELS[i.domain] ?? i.domain,
      minutes: i.plannedDurationMin,
      status: i.status,
      // The reasoning the engine wrote when it placed this action. "Warum
      // steht das heute?" is the question people actually ask, and without
      // this the model would have to invent an answer to it.
      rationale: i.rationale.text,
    })),
    weekShape: Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(weekStart, offset)
      const onDay = week.filter((i) => i.scheduledOn === date)
      return {
        date: `${WEEKDAY_LABELS[dayOf(offset)]} ${date}`,
        planned: onDay.length,
        done: onDay.filter((i) => i.status === 'done').length,
      }
    }),
    completion:
      scores?.domains.map((d) => ({
        domain: DOMAIN_LABELS[d.domain] ?? d.domain,
        done: d.done,
        resolved: d.resolved,
      })) ?? [],
    deviations: (review?.analysis.deviations ?? []).map(describeDeviation),
    reasons: reasons.counts.map(
      (c) =>
        `${REASON_LABELS[c.reason]} — ${c.count}× bei ${DOMAIN_LABELS[c.domain as PlanDomain] ?? c.domain}`,
    ),
    rules: input.personalRules.map((r) => r.ruleKey),
    notes: [
      ...checkIns
        .filter((c) => c.note !== null && c.note.trim().length > 0)
        .map((c) => ({ date: c.checkedInOn, text: c.note!.trim().slice(0, 300) })),
      ...reasons.notes,
    ].sort((a, b) => a.date.localeCompare(b.date)),
    // Only the answered ones. A refusal in the history would invite the model
    // to explain why it could not answer the last question instead of
    // answering this one.
    history: history
      .filter((h) => h.canAnswer)
      .map((h) => ({ question: h.question, answer: h.answer })),
  }
}

/**
 * Today's actions with their reasoning intact.
 *
 * Separate from `loadWeekItems`, which returns Observations — and an
 * Observation deliberately has no `rationale`, because the adaptive engine
 * must learn from what happened rather than from what the plan claimed. Here
 * the reasoning is the point.
 */
async function loadDay(profileId: string, date: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('plan_items')
    .select('*')
    .eq('profile_id', profileId)
    .eq('scheduled_on', date)

  return (data ?? []).map((row) => fromRow(row as ItemRow))
}

const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
function dayOf(offset: number) {
  return WEEK_ORDER[offset]
}

/** The same sentence Insights shows, so the model cannot contradict the screen. */
function describeDeviation(d: Deviation): string {
  const where =
    d.dimension === 'weekday'
      ? WEEKDAY_LABELS[d.bucket as keyof typeof WEEKDAY_LABELS] ?? d.bucket
      : d.dimension === 'time_slot'
        ? SLOT_LABELS[d.bucket as keyof typeof SLOT_LABELS] ?? d.bucket
        : d.dimension === 'domain'
          ? DOMAIN_LABELS[d.bucket as keyof typeof DOMAIN_LABELS] ?? d.bucket
          : d.bucket
  return `${where}: ${d.missed} von ${d.resolved} ausgefallen, sonst ${Math.round(d.comparisonMissRate * 100)} %`
}
