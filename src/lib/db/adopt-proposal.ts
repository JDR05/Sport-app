// Keeping the running week in step with what the model contributes.
//
// Insights lists "Was die KI beiträgt" the moment a proposal arrives. The plan
// did not: a week is materialised once (ADR-037), so somebody who tapped "KI
// dazuholen" on Wednesday saw three actions described on one screen and absent
// from every other one until the following Monday. The app was telling them
// about a plan it had not made.
//
// This is a *sync*, not a one-off adoption, and that is the whole design. It
// computes what the model's part of the remaining week should be and makes the
// stored rows match — so running it twice changes nothing the second time, and
// running it after somebody lowers "2× Krafttraining" to one actually removes
// the second one. An "add once" version cannot do the second thing, and
// silently duplicates on the first if anything ever calls it twice.
//
// What it may touch is deliberately narrow:
//
//   * only days still ahead, and only actions nobody has answered yet;
//   * only rows the model authored, plus the archetype's own sessions in the
//     two fields that carry words (title, reasoning) — never a day, a duration,
//     a domain or a status.
//
// That is why this does not break ADR-037. The rule there exists to stop a plan
// rewriting itself under somebody: moving Tuesday, dropping something they had
// already ticked. Nothing here moves or drops any of that.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { generatePlan } from '@/lib/engine'
import { assertPlanInvariants } from '@/lib/engine/safety'
import { shapeOwnedDomains, unshape } from '@/lib/engine/proposed'
import { startOfWeek } from '@/lib/engine/dates'
import { fromRow, materialise, toInsert, type ItemRow } from './item-mapping'
import { loadPlanInput } from './plan-input'
import type {
  Assumption, PlanItemStatus, PlannedItem, Rationale, PlanInput, WeekStrategy,
} from '@/lib/domain/types'

export type AdoptionResult = { added: number; removed: number; shaped: number }

const NOTHING: AdoptionResult = { added: 0, removed: 0, shaped: 0 }

type StoredItem = PlannedItem & { id: string; status: PlanItemStatus }

/**
 * Brings the current week in line with the proposal as this person wants it.
 *
 * Never throws: this runs beside the call that loads a week and beside the one
 * that saves a preference, and a failure here must not make either of those
 * look like it failed. The fallback is the old behaviour — the change arrives
 * with next week.
 */
export async function adoptProposalIntoCurrentWeek(
  profileId: string,
  today: string,
): Promise<AdoptionResult> {
  try {
    return await run(profileId, today)
  } catch {
    return NOTHING
  }
}

async function run(profileId: string, today: string): Promise<AdoptionResult> {
  const weekStart = startOfWeek(today)
  const supabase = await createClient()

  const goal = await supabase
    .from('goals')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (!goal.data) return NOTHING

  const planRow = await supabase
    .from('plans')
    .select('id, strategy, rationale, assumptions')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .eq('goal_id', goal.data.id)
    .is('superseded_by', null)
    .maybeSingle()

  // No week yet is the good case: the next one will be built from the proposal
  // like any other input.
  const plan = planRow.data
  if (!plan) return NOTHING

  const itemRows = await supabase.from('plan_items').select('*').eq('plan_id', plan.id)
  const existing = (itemRows.data ?? []).map((row) => fromRow(row as ItemRow)) as StoredItem[]

  const input = await loadPlanInput(profileId)
  if (!input) return NOTHING

  const strategy = plan.strategy as unknown as WeekStrategy
  const withToday = { ...input, today }

  // -------------------------------------------------------------- shaping --
  const shaped = await syncShaping(profileId, existing, strategy, withToday, today)
  if (shaped > 0) await markAiInvolved(profileId, plan.id)

  // --------------------------------------------------- adding and removing --
  const wanted = input.aiProposal ? proposedFor(withToday, weekStart, today) : []
  const changeable = existing.filter((i) => isProposed(i) && isOpen(i, today))
  const untouched = existing.filter((i) => !changeable.includes(i))

  const wantedKeys = new Set(wanted.map(keyOf))
  const presentKeys = new Set(changeable.map(keyOf))

  const toAdd = wanted.filter((i) => !presentKeys.has(keyOf(i)))
  const toRemove = changeable.filter((i) => !wantedKeys.has(keyOf(i)))

  // Idempotent: a second run finds the same rows already there and stops here.
  if (toAdd.length === 0 && toRemove.length === 0) return { ...NOTHING, shaped }

  // The resulting week has to survive the same checks the plan was built under.
  // Fail closed: a week that would break a rest day, a per-day ceiling or the
  // exertion budget is left exactly as it is.
  const resulting: PlannedItem[] = [
    ...untouched,
    ...changeable.filter((i) => !toRemove.includes(i)),
    ...toAdd,
  ]
  try {
    assertPlanInvariants(
      {
        strategy,
        items: resulting,
        rationale: (plan.rationale ?? []) as unknown as Rationale[],
        assumptions: (plan.assumptions ?? []) as unknown as Assumption[],
      },
      withToday,
    )
  } catch {
    return { ...NOTHING, shaped }
  }

  // Removals first. If the insert then fails, the week is smaller than wanted
  // rather than larger — under-planning is the safe direction, and the next
  // load runs this again anyway.
  let removed = 0
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('plan_items')
      .delete()
      .in('id', toRemove.map((i) => i.id))
      .eq('profile_id', profileId)
    if (!error) removed = toRemove.length
  }

  let added = 0
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('plan_items')
      .insert(toAdd.map((item) => toInsert(item, plan.id, profileId)))
    if (!error) added = toAdd.length
  }

  if (added > 0) await markAiInvolved(profileId, plan.id)

  return { added, removed, shaped }
}

/**
 * Marks the week as one the model helped build.
 *
 * Also what closes the catch-up path in `week-plan`: that runs this sync on
 * every load while the row still says `engine`, which is right for a week the
 * proposal arrived after, and wasteful for ever if nothing ever flips it.
 * Shaping counts — on a body-composition goal it is the only contribution the
 * model can make, so a week shaped and never marked would re-plan itself on
 * every single load of Heute.
 */
async function markAiInvolved(profileId: string, planId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('plans')
    .update({ generated_by: 'engine_ai' })
    .eq('id', planId)
    .eq('profile_id', profileId)
}

/**
 * The model's words on the archetype's sessions, brought up to date.
 *
 * Every candidate is restored to what the archetype called it *first*, and then
 * shaped again from the current proposal. Doing it in that order is what makes
 * lowering a count work: shaping on top of already-shaped rows can only ever
 * add words, never take them back off.
 *
 * Only the fields that carry words are written. The day, the duration, the
 * domain and the status are never in this update, which is why every invariant
 * still counts what it counted before.
 */
async function syncShaping(
  profileId: string,
  existing: StoredItem[],
  strategy: WeekStrategy,
  input: PlanInput,
  today: string,
): Promise<number> {
  const open = existing.filter((item) => isOpen(item, today) && !isProposed(item))
  if (open.length === 0) return 0

  const plain = open.map(unshape)
  const { items } = input.aiProposal
    ? shapeOwnedDomains(plain, input.aiProposal.actions, strategy.goalTrack.archetype)
    : { items: plain }

  const supabase = await createClient()
  let written = 0

  for (const [index, next] of items.entries()) {
    const current = open[index]
    if (next.title === current.title && next.rationale.text === current.rationale.text) continue

    const { error } = await supabase
      .from('plan_items')
      .update({
        title: next.title,
        rationale: next.rationale.text,
        rationale_based_on: next.rationale.basedOn,
        details: { ...next.details, cadence: next.cadence ?? 'weekly' },
      })
      .eq('id', current.id)
      .eq('profile_id', profileId)

    if (!error) written++
  }

  return written
}

/**
 * The proposal's actions, placed by the engine, for the days still ahead.
 *
 * Placed by the engine rather than by this module: which day an action may go
 * on is a safety question — free slots, rest days, the recovery spread — and
 * the one place that knows all of it is `generatePlan`. So the week is planned
 * afresh in memory, and only the model's part of it is taken.
 *
 * Days that have already passed are dropped. Adding work to Monday on
 * Wednesday would be asking somebody to have done something.
 */
function proposedFor(input: PlanInput, weekStart: string, today: string): PlannedItem[] {
  const proposed = generatePlan(input).items.filter(isProposed)
  return materialise(proposed, weekStart, today).filter((item) => item.scheduledOn >= today)
}

/**
 * What makes two actions the same one.
 *
 * Title and day, because that is all a proposed action has: the stored proposal
 * carries no ids, and the engine places by day. Two actions with the same title
 * on the same day are the same action however they got there.
 */
function keyOf(item: PlannedItem): string {
  return `${item.scheduledOn} ${item.title}`
}

/** Still ahead, and nobody has said anything about it yet. */
function isOpen(item: StoredItem, today: string): boolean {
  return item.scheduledOn >= today && (item.status === 'unknown' || item.status === 'planned')
}

function isProposed(item: PlannedItem): boolean {
  return item.details.kind === 'ai_proposed'
}
