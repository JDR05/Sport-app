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
import { withProposal } from './propose'
import { generatePlan } from '@/lib/engine'
import { startOfWeek } from '@/lib/engine/dates'
import { PlanInvariantError } from '@/lib/engine/errors'
import { fromRow, toInsert, type ItemRow } from './item-mapping'
import type {
  Assumption, PlanItemStatus, PlannedItem, Rationale, WeekStrategy,
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
  if (existing) return { ok: true, week: existing }

  const loaded = await loadPlanInput(profileId)
  if (!loaded) return { ok: false, reason: 'no_goal' }

  // Asked at most once per goal, and only when a week is actually being built —
  // so a person who never opens the app is never paid for.
  const input = await withProposal(profileId, { ...loaded, today })

  let plan
  try {
    plan = generatePlan({ ...input, today })
  } catch (error) {
    if (error instanceof PlanInvariantError) {
      return { ok: false, reason: 'unsafe', message: error.message }
    }
    throw error
  }

  const written = await writeWeek(profileId, weekStart, goalId, plan)
  if (written) return { ok: true, week: written }

  // The insert lost a race with another request. The winner's plan is the one
  // that counts — re-reading is the correct answer, not retrying the write.
  const raced = await readWeek(profileId, weekStart, goalId)
  return raced
    ? { ok: true, week: raced }
    : { ok: false, reason: 'unsafe', message: 'Plan konnte nicht gespeichert werden.' }
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
  }
}

/** Null when the unique index rejected the insert, i.e. another request won. */
async function writeWeek(
  profileId: string,
  weekStart: string,
  goalId: string,
  plan: ReturnType<typeof generatePlan>,
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

  if (planRow.error) return null

  if (plan.items.length > 0) {
    const inserted = await supabase
      .from('plan_items')
      .insert(plan.items.map((item) => toInsert(item, planRow.data.id, profileId)))
    if (inserted.error) return null
  }

  return readWeek(profileId, weekStart, goalId)
}
