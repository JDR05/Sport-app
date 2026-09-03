// Getting the model's actions into the week that is already running.
//
// Insights lists "Was die KI beiträgt" the moment a proposal arrives. The plan
// did not: a week is materialised once (ADR-037), so somebody who tapped "KI
// dazuholen" on Wednesday saw three actions described on one screen and absent
// from every other one until the following Monday. The app was telling them
// about a plan it had not made.
//
// The rule that week is fixed exists to stop a plan *rewriting itself* under
// somebody — moving Tuesday, dropping an action they had already ticked. That
// is not what this does. Nothing existing is touched: the proposed actions are
// added to the days that are still ahead, and only if the resulting week still
// passes every safety invariant. If it does not, nothing is added and the next
// week carries them, exactly as before.

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { generatePlan } from '@/lib/engine'
import { assertPlanInvariants } from '@/lib/engine/safety'
import { shapeOwnedDomains } from '@/lib/engine/proposed'
import { startOfWeek } from '@/lib/engine/dates'
import { fromRow, materialise, toInsert, type ItemRow } from './item-mapping'
import { loadPlanInput } from './plan-input'
import type {
  Assumption, PlannedItem, Rationale, PlanInput, WeekStrategy,
} from '@/lib/domain/types'

export type AdoptionResult = { added: number; shaped: number }

/**
 * Adds the proposal's actions to the current week, once.
 *
 * Never throws: this runs beside the call that fetched the proposal, and a
 * failure here must not make getting a proposal look like it failed. The
 * fallback is the old behaviour — the actions arrive with next week.
 */
export async function adoptProposalIntoCurrentWeek(
  profileId: string,
  today: string,
): Promise<AdoptionResult> {
  try {
    return await run(profileId, today)
  } catch {
    return { added: 0, shaped: 0 }
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
  if (!goal.data) return { added: 0, shaped: 0 }

  const planRow = await supabase
    .from('plans')
    .select('id, strategy, rationale, assumptions, generated_by')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .eq('goal_id', goal.data.id)
    .is('superseded_by', null)
    .maybeSingle()

  // No week yet is the good case: the next one will be built from the proposal
  // like any other input.
  const plan = planRow.data
  if (!plan) return { added: 0, shaped: 0 }

  const itemRows = await supabase
    .from('plan_items')
    .select('*')
    .eq('plan_id', plan.id)

  const existing = (itemRows.data ?? []).map((row) => fromRow(row as ItemRow))

  // Already carries the model's work. Adding it twice is the one outcome worse
  // than adding it late.
  const input = await loadPlanInput(profileId)
  if (!input?.aiProposal) return { added: 0, shaped: 0 }

  const strategy = plan.strategy as unknown as WeekStrategy

  // Naming the sessions this week already has.
  //
  // A separate thing from adding actions, and the one that matters on a
  // body-composition goal: that archetype owns training, movement and
  // nutrition, so a weight-loss proposal has no open domain to be added to and
  // used to reach the plan not at all. What it may do is say what the session
  // the engine planned actually is.
  //
  // This edits a running week, which ADR-037 otherwise forbids. The rule
  // exists to stop a plan rewriting itself under somebody — moving a day,
  // dropping an action they had already ticked. Nothing here moves or drops
  // anything: the day, the duration, the domain and the status stay exactly as
  // they were, and only the title and the reasoning change. Rows in the past
  // and rows already answered are left alone regardless, because renaming
  // those would change what the person answered about.
  const shaped = await shapeExistingWeek(profileId, existing, strategy, input.aiProposal, today)

  const wanted = proposedFor({ ...input, today }, weekStart, today)
  if (wanted.length === 0) return { added: 0, shaped }

  // The combined week has to survive the same checks the plan was built under.
  // Fail closed: a week that would break a rest day, a per-day ceiling or the
  // exertion budget gets nothing rather than something.
  const combined: PlannedItem[] = [...existing, ...wanted]
  try {
    assertPlanInvariants(
      {
        strategy,
        items: combined,
        rationale: (plan.rationale ?? []) as unknown as Rationale[],
        assumptions: (plan.assumptions ?? []) as unknown as Assumption[],
      },
      { ...input, today },
    )
  } catch {
    return { added: 0, shaped }
  }

  const inserted = await supabase
    .from('plan_items')
    .insert(wanted.map((item) => toInsert(item, plan.id, profileId)))

  if (inserted.error) return { added: 0, shaped }

  // The row now describes a week the model helped build, and the Insights
  // screen reads this to say which it was.
  await supabase
    .from('plans')
    .update({ generated_by: 'engine_ai' })
    .eq('id', plan.id)
    .eq('profile_id', profileId)

  return { added: wanted.length, shaped }
}

/**
 * Rewrites the titles the model has better words for. Returns how many.
 *
 * Only rows that are still ahead and still unanswered, and only the three
 * fields that carry words. `shapeOwnedDomains` decides which items qualify —
 * sessions, never standing rules and never a row whose title carries a
 * computed value — so this function does no judging of its own.
 */
async function shapeExistingWeek(
  profileId: string,
  existing: Array<PlannedItem & { id: string; status: string }>,
  strategy: WeekStrategy,
  proposal: NonNullable<PlanInput['aiProposal']>,
  today: string,
): Promise<number> {
  const open = existing.filter(
    (item) =>
      item.scheduledOn >= today && (item.status === 'unknown' || item.status === 'planned'),
  )
  if (open.length === 0) return 0

  const { items, shaped } = shapeOwnedDomains(
    open,
    proposal.actions,
    strategy.goalTrack.archetype,
  )
  if (shaped === 0) return 0

  const supabase = await createClient()
  let written = 0

  for (const [index, next] of items.entries()) {
    if (next.title === open[index].title) continue

    const update = await supabase
      .from('plan_items')
      .update({
        title: next.title,
        rationale: next.rationale.text,
        rationale_based_on: next.rationale.basedOn,
        details: { ...next.details, cadence: next.cadence ?? 'weekly' },
      })
      .eq('id', open[index].id)
      .eq('profile_id', profileId)

    if (!update.error) written++
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
  const planned = generatePlan(input)
  const proposed = planned.items.filter(isProposed)

  return materialise(proposed, weekStart, today).filter((item) => item.scheduledOn >= today)
}

function isProposed(item: PlannedItem): boolean {
  return (item.details as Record<string, unknown> | undefined)?.kind === 'ai_proposed'
}
