// The AI, every day.
//
// The measurement that produced this file: in four weeks of real use the model
// spoke five times. Twice when the goal was created, three times as a weekly
// impulse. Every other call in this product is capped at once per goal
// (`goals.intake_asked_at`, `goals.ai_proposal_at`), and the impulse has a
// two-day floor. So the product whose stated advantage is a personal behaviour
// model built over months was, in practice, an onboarding wizard with a
// newsletter.
//
// Two things separate this from the weekly note, and they are the reasons it
// is a second feature rather than a shorter interval on the first one:
//
//   1. It is about *today* — the rows that are on the screen right now, not a
//      week in aggregate. "Diese Woche lief Training schlecht" is true and
//      unusable at 7 in the morning.
//   2. It may change something. Every other AI output in this app is prose.
//      This one can carry one adjustment to today, which the person applies
//      with a tap and which `applicable()` re-checks before it touches a row.
//
// One row per person per day, and the uniqueness *is* the rate limit: the call
// happens when Today is opened and no row exists yet, so eleven opens cost one
// call and ten reads.

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { adapterFor } from '@/lib/ai/consent'
import { loadPlanInput } from './plan-input'
import { loadCheckIns } from './tracking'
import { loadWeekItems } from './analysis'
import { REASON_LABELS } from '@/lib/adaptive/reaction'
import { DOMAIN_LABELS, WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import type { StatusReason } from '@/lib/adaptive/reaction'
import type { PlanDomain } from '@/lib/domain/types'
import { applicable, type Adjust, type DayAction } from '@/lib/domain/dayBrief'
import { addDays, startOfWeek, timeSlotOf, weekdayOf } from '@/lib/engine/dates'
import type { TimeSlot } from '@/lib/domain/types'

/** How far back the model may look. One week of outcomes, and no further. */
const LOOKBACK_DAYS = 7

/**
 * How often a failed call may be tried again on the same day.
 *
 * Both extremes are wrong. Never writing a row on a failure means every open
 * of Today calls the provider again — pull-to-refresh and a tab switch are page
 * loads — so a provider having a bad afternoon gets hammered. Writing silence
 * on a failure means one hiccup costs the whole day, which is the exact
 * complaint this feature exists to answer, and it is what happened on the first
 * day it ran: every call came back invalid_json because the model wrapped its
 * object in prose, and the day went quiet on the strength of a parser problem.
 *
 * Three is enough to cross a bad minute and few enough to be a floor on cost.
 */
const MAX_ATTEMPTS = 3

/** What the screen draws. Null everywhere means: no card. */
export type DayBrief = {
  line: string
  /** One of today's item ids, or null. Resolved against today's rows by the screen. */
  focusItemId: string | null
  adjust: (Adjust & { label: string }) | null
  /** Set once the person has tapped it, so the card can say so instead of re-offering. */
  adjustAppliedAt: string | null
  evidence: string[]
}

export type ApplyResult =
  | { ok: true; brief: DayBrief }
  /**
   * The suggestion no longer fits the day — they ticked the action off between
   * the card being drawn and the tap. Not an error to apologise for: the state
   * it wanted to change is simply gone.
   */
  | { ok: false; reason: 'stale' }
  | { ok: false; reason: 'failed' }

/**
 * Today's brief, writing one first if today has none.
 *
 * Never throws. No key, no consent, a refused answer, a failed safety check and
 * an ordinary quiet day all end the same way — no card — and the actions, the
 * check-in and the deterministic patterns on Muster are all still there. That
 * is principle 3 of CLAUDE.md and it is the condition for this not being an AI
 * wrapper.
 */
export async function ensureDailyBrief(
  profileId: string,
  today: string,
): Promise<DayBrief | null> {
  try {
    const row = await loadRow(profileId, today)
    if (row && settled(row)) return toBrief(row)
    return await write(profileId, today, row?.attempts ?? 0)
  } catch {
    return null
  }
}

/**
 * Whether today's row is the last word.
 *
 * `attempts === 0` means the model answered, and "nothing to say" is an answer
 * — the commonest one, and final. Anything above zero means nobody has heard
 * from it yet and the next load may try again, up to the ceiling.
 */
function settled(row: { attempts: number }): boolean {
  return row.attempts === 0 || row.attempts >= MAX_ATTEMPTS
}

/** Today's brief as the screen wants it, without writing one. */
export const loadDailyBrief = cache(async function loadDailyBrief(
  profileId: string,
  today: string,
): Promise<DayBrief | null> {
  const row = await loadRow(profileId, today)
  return row ? toBrief(row) : null
})

async function loadRow(profileId: string, today: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('profile_id', profileId)
    .eq('brief_on', today)
    .maybeSingle()
  return data
}

function toBrief(row: {
  has_something_to_say: boolean
  line: string
  focus_item_id: string | null
  adjust_item_id: string | null
  adjust_kind: string | null
  adjust_to_slot: string | null
  adjust_reason: string | null
  adjust_applied_at: string | null
  evidence: unknown
}): DayBrief | null {
  if (!row.has_something_to_say) return null

  const adjust =
    row.adjust_item_id && row.adjust_kind && row.adjust_reason
      ? {
          itemId: row.adjust_item_id,
          kind: row.adjust_kind as 'move' | 'drop',
          toSlot: (row.adjust_to_slot as TimeSlot | null) ?? null,
          reason: row.adjust_reason,
          label: labelFor(row.adjust_kind as 'move' | 'drop', row.adjust_to_slot),
        }
      : null

  return {
    line: row.line,
    focusItemId: row.focus_item_id,
    adjust,
    adjustAppliedAt: row.adjust_applied_at,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
  }
}

/**
 * The button's words, written by the app.
 *
 * Not by the model, and not read back from a column it wrote. The model
 * supplies the *reason*; what the tap does is the app's statement about its own
 * behaviour, and a model that could phrase it could phrase it into something
 * the tap does not do.
 */
function labelFor(kind: 'move' | 'drop', slot: string | null): string {
  if (kind === 'drop') return 'Heute streichen'
  const words: Record<string, string> = { early: 'morgens', midday: 'mittags', evening: 'abends' }
  return `Auf ${words[slot ?? ''] ?? 'später'} verschieben`
}

async function write(
  profileId: string,
  today: string,
  failedSoFar: number,
): Promise<DayBrief | null> {
  const weekStart = startOfWeek(today)

  const [input, weekItems] = await Promise.all([
    loadPlanInput(profileId),
    loadWeekItems(profileId, weekStart),
  ])
  // No goal means no day to talk about. Nothing is written, so the first load
  // after onboarding asks properly rather than inheriting a "nothing to say".
  if (!input) return null

  const todaysOpen = weekItems.filter((i) => i.scheduledOn === today && i.status === 'unknown')

  // Two reads that only make sense once there is a day: the outcomes of the
  // last week, and how the person said those days felt.
  //
  // `recent` is read directly rather than filtered out of `weekItems`, which is
  // what it did first and which was wrong every Monday: the week's rows start
  // on Monday, so on a Monday the last seven days lie entirely outside them and
  // the model was handed an empty history on the one morning that most needs
  // last week's. A seven-day window is a seven-day read.
  const since = addDays(today, -LOOKBACK_DAYS)
  const [checkIns, recent] = await Promise.all([
    loadCheckIns(profileId, since),
    recentOutcomes(profileId, since, today),
  ])

  // A day with nothing open and nothing behind it is a day with nothing to
  // read. Checked before the call rather than left to the model, because
  // paying a provider to tell us a blank day is blank is the kind of cost that
  // only shows up on the invoice.
  if (todaysOpen.length === 0 && recent.length === 0) {
    // Settled, not failed: there is genuinely nothing to read, and asking again
    // three times would not change that.
    await settle(profileId, today, 'app')
    return null
  }

  const availableSlots = slotsAvailableOn(input.schedule.freeSlots, today)

  const adapter = await adapterFor(profileId)
  const result = await adapter.dailyBrief({
    goalText: input.goal.rawText,
    archetype: input.goal.archetype,
    today,
    weekday: WEEKDAY_LABELS[weekdayOf(today)] ?? '',
    items: todaysOpen.map((i) => ({
      id: i.itemId,
      title: i.title,
      domain: DOMAIN_LABELS[i.domain] ?? i.domain,
      track: i.track,
      slot: i.timeSlot,
      durationMin: i.plannedDurationMin,
    })),
    availableSlots,
    recent,
    checkIns: checkIns
      .filter((c) => c.checkedInOn >= since)
      .map((c) => ({
        date: c.checkedInOn,
        energy: c.energy,
        stress: c.stress,
        sleepHours: c.sleepHours,
        note: c.note ? c.note.trim().slice(0, 300) : null,
      })),
    rules: input.personalRules.map((r) => r.ruleKey),
    commitments: input.schedule.commitments
      .filter((c) => c.weekday === weekdayOf(today))
      .map((c) => `${c.label}, ${c.start}, ${c.minutes} min`),
    previous: await previousLine(profileId, today),
  })

  // A call that did not work and a model that had nothing to say are written
  // down differently, and the difference is the whole point of `attempts`.
  if (!result.ok) {
    await recordFailure(profileId, today, adapter.name, failedSoFar + 1)
    return null
  }

  // Silence is written down, not skipped. Without a row, every further load of
  // an ordinary day would ask again and pay again for the same nothing.
  if (!result.value.hasSomethingToSay) {
    await settle(profileId, today, adapter.name)
    return null
  }

  const brief = result.value

  // The model's proposal, checked against the day it is about. An id it
  // invented, one already ticked off, a slot this person does not have — all of
  // them drop the adjustment and keep the sentence, because the sentence is
  // still about a day the model read correctly.
  const proposed: Adjust | null = brief.adjust
    ? {
        itemId: brief.adjust.itemId,
        kind: brief.adjust.kind,
        toSlot: brief.adjust.toSlot,
        reason: brief.adjust.reason,
      }
    : null
  const adjust =
    proposed && applicable(proposed, asDayActions(todaysOpen), availableSlots).ok ? proposed : null

  // Same check for the focus: pointing at an action that is not on today's
  // screen is worse than pointing at nothing.
  const focusItemId = todaysOpen.some((i) => i.itemId === brief.focusItemId)
    ? brief.focusItemId
    : null

  const written = await store(
    profileId,
    today,
    { line: brief.line, focusItemId, adjust, evidence: brief.basedOn },
    adapter.name,
  )
  // The write is an upsert, so a concurrent request no longer loses a race —
  // it overwrites. What is left here is a genuine write failure, and the honest
  // answer to that is the row as it actually stands rather than the card this
  // request was about to draw from memory.
  if (!written) return (await loadDailyBriefFresh(profileId, today)) ?? null

  return {
    line: brief.line,
    focusItemId,
    adjust: adjust ? { ...adjust, label: labelFor(adjust.kind, adjust.toSlot) } : null,
    adjustAppliedAt: null,
    evidence: brief.basedOn,
  }
}

/**
 * Applies the change the person tapped.
 *
 * The gate runs again here, against rows read now rather than rows read when
 * the card was drawn. Between those two moments they may have ticked the action
 * off, and without this the tap would quietly rewrite the slot of something
 * already done.
 */
export async function applyBriefAdjust(
  profileId: string,
  today: string,
): Promise<ApplyResult> {
  const brief = await loadDailyBriefFresh(profileId, today)
  if (!brief?.adjust) return { ok: false, reason: 'stale' }
  if (brief.adjustAppliedAt) return { ok: true, brief }

  const input = await loadPlanInput(profileId)
  if (!input) return { ok: false, reason: 'failed' }

  const weekItems = await loadWeekItems(profileId, startOfWeek(today))
  const todaysOpen = weekItems.filter((i) => i.scheduledOn === today && i.status === 'unknown')
  const verdict = applicable(
    brief.adjust,
    asDayActions(todaysOpen),
    slotsAvailableOn(input.schedule.freeSlots, today),
  )
  if (!verdict.ok) return { ok: false, reason: 'stale' }

  const supabase = await createClient()

  // `.select('id')` and a length check, not `error === null`: a zero-row UPDATE
  // is not an error in Postgres, so an id that no longer belongs to this
  // person under RLS would report success having written nothing.
  const change =
    brief.adjust.kind === 'drop'
      ? { status: 'not_relevant' as const, status_changed_at: new Date().toISOString() }
      : { time_slot: brief.adjust.toSlot }

  const { data: rows } = await supabase
    .from('plan_items')
    .update(change)
    .eq('id', brief.adjust.itemId)
    .eq('profile_id', profileId)
    .select('id')
  if ((rows ?? []).length !== 1) return { ok: false, reason: 'failed' }

  const appliedAt = new Date().toISOString()
  const { data: marked } = await supabase
    .from('daily_briefs')
    .update({ adjust_applied_at: appliedAt })
    .eq('profile_id', profileId)
    .eq('brief_on', today)
    .select('id')

  // The action moved and the note about it did not. Reported as success,
  // because the thing the person asked for happened: the worst case is the
  // card offering it again after a reload, which is a smaller lie than saying
  // it failed when the day already changed.
  if ((marked ?? []).length !== 1) return { ok: true, brief: { ...brief, adjustAppliedAt: null } }

  return { ok: true, brief: { ...brief, adjustAppliedAt: appliedAt } }
}

/** The same read without React's per-request cache, for after a write. */
async function loadDailyBriefFresh(profileId: string, today: string): Promise<DayBrief | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('profile_id', profileId)
    .eq('brief_on', today)
    .maybeSingle()
  return data ? toBrief(data) : null
}

async function previousLine(profileId: string, today: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_briefs')
    .select('line')
    .eq('profile_id', profileId)
    .lt('brief_on', today)
    .eq('has_something_to_say', true)
    .order('brief_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.line ?? null
}

async function store(
  profileId: string,
  today: string,
  said: {
    line: string
    focusItemId: string | null
    adjust: Adjust | null
    evidence: string[]
  },
  source: string,
): Promise<boolean> {
  const supabase = await createClient()
  // Upsert rather than insert: a failed attempt earlier today already left a
  // row, and the answer that finally arrives has to be able to replace it.
  const { error } = await supabase.from('daily_briefs').upsert(
    {
      profile_id: profileId,
      brief_on: today,
      has_something_to_say: true,
      line: said.line,
      focus_item_id: said.focusItemId,
      adjust_item_id: said.adjust?.itemId ?? null,
      adjust_kind: said.adjust?.kind ?? null,
      // Null for a drop, and the database insists on it: the two kinds are
      // different changes and the column may not be ambiguous about which
      // one was offered.
      adjust_to_slot: said.adjust?.kind === 'move' ? said.adjust.toSlot : null,
      adjust_reason: said.adjust?.reason ?? null,
      evidence: said.evidence,
      source,
      // The model answered. Whatever went wrong before is history.
      attempts: 0,
    },
    { onConflict: 'profile_id,brief_on' },
  )
  return error === null
}

/**
 * The day is closed: the model answered and had nothing to say, or there was
 * nothing to ask about. `attempts: 0` is what makes it final.
 */
async function settle(profileId: string, today: string, source: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('daily_briefs').upsert(
    {
      profile_id: profileId,
      brief_on: today,
      has_something_to_say: false,
      line: '',
      evidence: [],
      source,
      attempts: 0,
    },
    { onConflict: 'profile_id,brief_on' },
  )
}

/**
 * The call did not work. Written so the next load knows how many have failed,
 * and stops after the ceiling instead of asking a broken provider all evening.
 */
async function recordFailure(
  profileId: string,
  today: string,
  source: string,
  attempts: number,
): Promise<void> {
  const supabase = await createClient()
  await supabase.from('daily_briefs').upsert(
    {
      profile_id: profileId,
      brief_on: today,
      has_something_to_say: false,
      line: '',
      evidence: [],
      source,
      attempts: Math.min(attempts, MAX_ATTEMPTS),
    },
    { onConflict: 'profile_id,brief_on' },
  )
}

/** The gate's view of today. Deliberately less than an Observation. */
function asDayActions(
  items: Array<{ itemId: string; status: string; track: string; timeSlot: TimeSlot | null }>,
): DayAction[] {
  return items.map((i) => ({ id: i.itemId, status: i.status, track: i.track, slot: i.timeSlot }))
}

/**
 * Which parts of today this person actually has.
 *
 * From the free slots they gave in the intake, not from the three buckets
 * existing. Somebody who said their Tuesday is free from 18:00 has one slot on
 * a Tuesday, and a move into "mittags" is a move into a time they are at work.
 */
function slotsAvailableOn(
  freeSlots: Array<{ weekday: string; start: string }>,
  today: string,
): TimeSlot[] {
  const day = weekdayOf(today)
  const slots = new Set<TimeSlot>()
  for (const s of freeSlots) {
    if (s.weekday === day) slots.add(timeSlotOf(s.start))
  }
  return [...slots]
}

/**
 * What actually happened in the last seven days, with the reason attached to
 * the action it belongs to.
 *
 * The reason has to come from the same row, and this is the second attempt.
 * The first reused `weekReasons`, which aggregates to "zu müde × 3, Training" —
 * useful for a weekly impulse and wrong here, because matching it back by
 * domain hangs Tuesday's reason on Thursday's action. A model told that
 * Thursday failed because somebody was tired on Tuesday is being handed an
 * invention as evidence, which is the exact failure principle 4 is about.
 *
 * `unknown` is left out rather than sent as a third state. ADR-011: an
 * untouched action is not evidence of anything, and a model handed fifty of
 * them reads fifty failures.
 */
async function recentOutcomes(
  profileId: string,
  since: string,
  today: string,
): Promise<Array<{
  date: string
  weekday: string
  title: string
  domain: string
  status: string
  reason: string | null
}>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('plan_items')
    .select('scheduled_on, title, domain, status, status_reason')
    .eq('profile_id', profileId)
    .gte('scheduled_on', since)
    .lt('scheduled_on', today)
    .in('status', ['done', 'missed'])
    .order('scheduled_on', { ascending: true })

  return (data ?? []).map((row) => ({
    date: row.scheduled_on,
    weekday: WEEKDAY_LABELS[weekdayOf(row.scheduled_on)] ?? '',
    title: row.title,
    domain: DOMAIN_LABELS[row.domain as PlanDomain] ?? row.domain,
    status: row.status,
    reason: row.status_reason
      ? REASON_LABELS[row.status_reason as StatusReason] ?? null
      : null,
  }))
}
