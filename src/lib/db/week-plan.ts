// Turning a computed plan into rows, once per week.
//
// ADR-037 said plans are recomputed rather than stored, and named the moment
// that changes: as soon as actions can be ticked off. A status needs something
// to attach to, and "the third item on Tuesday" is not an identity — it moves
// the instant the engine changes its mind about Tuesday.
//
// So a week is materialised the first time it is opened, and from then on that
// week is fixed. The plan a person worked through must not silently rewrite
// itself under them because a rule was learned on Thursday. New knowledge
// applies to the next week; the current one is a promise already made.
//
// Writes are guarded by a partial unique index rather than by checking first:
// two requests arriving together would both find nothing and both insert. The
// index is keyed on the goal as well, so changing goal mid-week produces a new
// current plan while the old one stays put as history.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadPlanInput } from './plan-input'
import { recheckPersonalRules } from './rules'
import { generatePlan } from '@/lib/engine'
import { startOfWeek } from '@/lib/engine/dates'
import { PlanInvariantError } from '@/lib/engine/errors'
import { fromRow, materialise, toInsert, type ItemRow } from './item-mapping'
import { loadCommitments } from './commitments'
import type {
  Assumption, Commitment, PlanItemStatus, PlannedItem, Rationale, WeekStrategy,
} from '@/lib/domain/types'

/** A planned action that now exists as a row, so a status can point at it. */
export type StoredItem = PlannedItem & {
  id: string
  status: PlanItemStatus
}

export type StoredWeek = {
  planId: string
  weekStart: string
  strategy: WeekStrategy
  rationale: Rationale[]
  assumptions: Assumption[]
  items: StoredItem[]
  /**
   * The week this person already had before the app said anything.
   *
   * Carried alongside the plan rather than fetched separately, because the two
   * are read together on every screen that shows a day. Today looked empty on
   * the evening somebody has football — the app knew about the training well
   * enough to plan around it (`sportDays`) and then showed a screen that said
   * nothing was on. That is the app hiding the largest part of somebody's own
   * week from them.
   */
  commitments: Commitment[]
}

export type WeekResult =
  | { ok: true; week: StoredWeek }
  | { ok: false; reason: 'no_goal' }
  /** A safety invariant refused the plan. The message is shown, never hidden. */
  | { ok: false; reason: 'unsafe'; message: string }

export async function ensureWeekPlan(profileId: string, today: string): Promise<WeekResult> {
  const weekStart = startOfWeek(today)

  const goalId = await activeGoalId(profileId)
  if (!goalId) return { ok: false, reason: 'no_goal' }

  const existing = await readWeek(profileId, weekStart, goalId)
  // An existing week with no actions in it is not a week, it is wreckage.
  //
  // writeWeek inserts the plan row and then its items, and undoes the plan row
  // if the item insert *returns* an error. A process that dies between the two
  // — a serverless timeout is entirely ordinary — leaves the plan row with
  // nothing under it. readWeek then reports a valid empty week for ever, and
  // the partial unique index forbids building another one for that week and
  // goal: the standoff ADR-033 describes, now permanent.
  //
  // Deleting is safe precisely because it is empty: there are no statuses to
  // lose, so nothing of the person's is thrown away. A week that is
  // legitimately empty — signing up late in the week, where materialise drops
  // the days before someone's first — simply gets rebuilt to the same empty
  // result, which costs one insert and is correct either way.
  if (existing && existing.items.length === 0) {
    await discardEmptyWeek(profileId, existing.planId)
  } else if (existing) {
    return { ok: true, week: existing }
  }

  const loaded = await loadPlanInput(profileId)
  if (!loaded) return { ok: false, reason: 'no_goal' }

  // No model call here at all any more, and that is the fix for two things.
  //
  // This used to ask on a four-second budget, as a fallback for a goal that was
  // never asked. Two problems, and the second is the serious one:
  //
  //   * Four seconds is four seconds added to the first load of a week, on the
  //     screen somebody opens first. That is the "es hängt sich manchmal auf"
  //     this project has already chased once.
  //   * `withProposal` stamps `ai_proposal_at` whether or not an answer came
  //     back — that is what stops a retry loop — and the stamp is one-way. A
  //     real provider takes about twelve seconds for a proposal (ADR-088), so
  //     a four-second budget was a guaranteed timeout that permanently marked
  //     the goal "asked, nothing came back". Somebody who started the catch-up
  //     flow on /ai and then tapped away before answering had it silently
  //     undone by their next page load.
  //
  // The proposal is fetched in the two places where a person is deliberately
  // waiting: the onboarding, and /ai. A goal without one plans deterministically
  // and Insights says so with a button to fix it (ADR-089). A page load is not
  // a place to wait for a model, and it is certainly not a place to close a
  // door that only an explicit action can reopen.
  const input = { ...loaded, today }

  let plan
  try {
    plan = generatePlan({ ...input, today })
  } catch (error) {
    if (error instanceof PlanInvariantError) {
      return { ok: false, reason: 'unsafe', message: error.message }
    }
    throw error
  }

  const written = await writeWeek(profileId, weekStart, goalId, plan, today)
  if (written) {
    // A new week is the moment to re-examine what the app believes about this
    // person. It happens exactly once per week for free: the partial unique
    // index means this branch is reached once and only once. Deliberately not
    // awaited for its result and unable to throw — a re-check that fails is
    // never worth someone not seeing their week.
    await recheckPersonalRules(profileId, today)
    return { ok: true, week: written }
  }

  // Either the insert lost a race with another request, in which case the
  // winner's plan is the one that counts and re-reading is the correct answer,
  // or the write failed and removed its own half-built row — in which case
  // there is nothing to read and the honest reply is that it did not work.
  // Retrying here would only repeat whatever just failed.
  const raced = await readWeek(profileId, weekStart, goalId)
  return raced
    ? { ok: true, week: raced }
    : { ok: false, reason: 'unsafe', message: 'Plan konnte nicht gespeichert werden.' }
}

/**
 * Removes a plan row that never got its actions.
 *
 * Scoped to the profile as well as the id: row level security already refuses
 * somebody else's row, but a delete that relies on being refused is one
 * refactor away from not being.
 */
async function discardEmptyWeek(profileId: string, planId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('plans').delete().eq('id', planId).eq('profile_id', profileId)
}

async function activeGoalId(profileId: string): Promise<string | null> {
  const supabase = await createClient()
  const goal = await supabase
    .from('goals')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  return goal.data?.id ?? null
}

async function readWeek(
  profileId: string,
  weekStart: string,
  goalId: string,
): Promise<StoredWeek | null> {
  const supabase = await createClient()

  const planRow = await supabase
    .from('plans')
    .select('*')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .eq('goal_id', goalId)
    .is('superseded_by', null)
    .maybeSingle()

  if (!planRow.data) return null

  const itemRows = await supabase
    .from('plan_items')
    .select('*')
    .eq('plan_id', planRow.data.id)
    .order('scheduled_on', { ascending: true })

  const items: StoredItem[] = (itemRows.data ?? []).map((row) => fromRow(row as ItemRow))

  return {
    planId: planRow.data.id,
    weekStart,
    strategy: planRow.data.strategy as unknown as WeekStrategy,
    rationale: (planRow.data.rationale ?? []) as unknown as Rationale[],
    assumptions: (planRow.data.assumptions ?? []) as unknown as Assumption[],
    items,
    // Read live rather than frozen into the plan row. The plan a person worked
    // through must not rewrite itself (ADR-037), but a commitment they added
    // on Wednesday is a fact about Wednesday — showing them last week's
    // version of their own life would be a strange kind of consistency.
    commitments: await loadCommitments(profileId),
  }
}

/** Null when the unique index rejected the insert, i.e. another request won. */
async function writeWeek(
  profileId: string,
  weekStart: string,
  goalId: string,
  plan: ReturnType<typeof generatePlan>,
  /** The person's first day in this week — nothing before it is written. */
  from: string,
): Promise<StoredWeek | null> {
  const supabase = await createClient()

  const planRow = await supabase
    .from('plans')
    .insert({
      profile_id: profileId,
      goal_id: goalId,
      week_start: weekStart,
      strategy: plan.strategy as unknown as Record<string, unknown>,
      rationale: plan.rationale as unknown as Record<string, unknown>[],
      assumptions: plan.assumptions as unknown as Record<string, unknown>[],
    })
    .select('id')
    .single()

  // A real race loses here, at the partial unique index over the current week,
  // and losing is fine: the winner's plan is the one that counts.
  if (planRow.error) return null

  // Nothing before the person's first day — see materialise().
  const rows = materialise(plan.items, weekStart, from)

  if (rows.length > 0) {
    // try/catch as well as the returned error: a thrown insert would otherwise
    // skip the compensating delete entirely and leave exactly the orphaned
    // plan row this block exists to prevent.
    const inserted = await supabase
      .from('plan_items')
      .insert(rows.map((item) => toInsert(item, planRow.data.id, profileId)))
      .then(
        (r) => r,
        (error: unknown) => ({ error: { message: String(error) } }),
      )

    // Take the plan row back out. Leaving it was the whole bug: the caller
    // re-reads after a null, finds the row this function just wrote, and hands
    // back a week with no actions in it — while the unique index makes it
    // impossible to ever build that week again. A permanently empty week, and
    // no path out of it.
    if (inserted.error) {
      await supabase.from('plans').delete().eq('id', planRow.data.id).eq('profile_id', profileId)
      return null
    }
  }

  return readWeek(profileId, weekStart, goalId)
}

