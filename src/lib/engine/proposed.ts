// Turning a model's proposal into scheduled actions.
//
// The division of labour, from docs/AI_CAPABILITIES.md: the model says *what*
// and roughly how often; this file decides *when*. Only the engine knows the
// free slots, the hard exclusions, the rest days and the ceiling per day — so
// only the engine may place anything on a calendar.
//
// Everything produced here is an ordinary PlannedItem. It goes through
// assertPlanInvariants exactly like an archetype's own output, and a plan that
// violates a limit is rejected whole rather than trimmed. Silently repairing a
// bad suggestion would hide that one was produced, and this architecture wants
// to be able to see that.

import { dateOf, pickDays, slotOf, spreadAcrossWeek, type PlanContext } from './context'
import {
  MIN_REST_DAYS,
  MIN_VIABLE_SESSION_MINUTES,
  PROPOSED_STRENUOUS_MINUTES,
} from './constants'
import { weekdayOf } from './dates'
import type {
  ActionPreference, ActionPreferences, AiProposal, GoalArchetype, PlanDomain, PlannedItem,
  ProposedAction, TimeSlot, Weekday,
} from '@/lib/domain/types'

/**
 * How many proposed actions may ride along on top of an archetype plan.
 *
 * Three, because Today shows three to five actions in total and the archetype
 * has already claimed most of that. A model handed an unbounded budget fills
 * it, and the result is the twenty-cards-per-screen the brief rules out.
 */
export const MAX_AUGMENT_ACTIONS = 3

/**
 * Domains each archetype manages itself, and which a proposal may not add to
 * while that archetype is planning.
 *
 * Not a stylistic boundary — a safety one. Strength caps training items to keep
 * rest days; nutrition quality caps additions to three a week because one
 * change at a time is the whole method. Those caps are enforced as invariants,
 * so a proposal reaching into such a domain does not produce a slightly busy
 * plan: it produces a *rejected* plan, and the person sees nothing at all.
 *
 * What is left open is exactly the space the archetypes are weakest in — mind,
 * routine, focus, movement. Which is where goals like "motivierter werden" or
 * "weniger prokrastinieren" actually live, and why this restriction costs the
 * model almost nothing it needed.
 */
const OWNED_DOMAINS: Record<GoalArchetype, readonly PlanDomain[]> = {
  // `movement` is owned wherever an archetype has a load regime, and that is
  // the fix for the worst hole this engine had. Each archetype counts its
  // limits over the domain it owns — weekly kilometres, rest days, recovery
  // gaps — so leaving `movement` open meant a proposal could put twenty-two
  // hours of hill running into a beginner's week and every one of those counts
  // reported zero. `movement` is the natural word for a run, and the prompt
  // offers it, so this was one word away from happening on its own.
  //
  // What it costs the model: it can no longer add a walk to a strength goal.
  // The baseline already plans movement, so that is close to nothing.
  body_composition: ['training', 'movement', 'nutrition'],
  strength: ['training', 'movement'],
  endurance: ['training', 'movement'],
  // Sleep owns exertion too. A ninety-minute evening session against a
  // prescribed 22:00 bedtime is the same instruction as "sleep less", written
  // as a schedule instead of a sentence.
  sleep_recovery: ['sleep', 'training', 'movement'],
  nutrition_quality: ['nutrition'],
  habit_routine: ['self_improvement'],
  // The fallback owns nothing, which is precisely why it is the one archetype a
  // proposal is allowed to replace outright.
  general_health: [],
}

/**
 * Whether the model wrote this line.
 *
 * Two kinds, one question. `ai_proposed` is an action the model added in a
 * domain the archetype left open; `ai_shaped` is a session the archetype
 * planned and the model named. Every screen that marks the model's
 * contribution means both, and asking for one of them is the bug that made
 * "Was die KI beiträgt" list three actions the plan showed none of.
 */
export function isAiAuthored(item: { details: Record<string, unknown> }): boolean {
  return item.details?.kind === 'ai_proposed' || item.details?.kind === 'ai_shaped'
}

/** Whether a proposed action may be scheduled alongside this archetype. */
export function isOpenDomain(archetype: GoalArchetype, domain: PlanDomain): boolean {
  return !OWNED_DOMAINS[archetype].includes(domain)
}

export function scheduleProposed(
  ctx: PlanContext,
  actions: ProposedAction[],
  limit: number,
  /**
   * Days the archetype already put training on.
   *
   * Training load belongs to the archetype: it owns the rest-day rule, the
   * consecutive-day cap and, for strength, the recovery gap between muscle
   * groups. So a proposal may ride along on a day that is already a training
   * day — "ten minutes of mobility after your session" — but it may not create
   * a new one, because that is how the rest-day budget gets spent by something
   * that never knew about it.
   *
   * Empty means there is no archetype track to ride along with, which is the
   * takeover case: the proposal may then open training days of its own, still
   * bounded by the rest-day minimum below.
   */
  existingTrainingDays: Weekday[] = [],
): PlannedItem[] {
  const items: PlannedItem[] = []
  const trainingDays = trainingBudget(ctx, existingTrainingDays)

  for (const action of actions.slice(0, limit)) {
    // Training is placed only on days that survived the hard exclusions and the
    // recovery spread. `pickDays` falls back to the whole week when nothing is
    // available, which is right for a reminder and wrong for a session — it
    // would put training on a day the person said never works. With no usable
    // day, the action is dropped rather than moved somewhere forbidden.
    // The recovery spread applies by duration, not by label.
    //
    // This asked `domain === 'training'`, and once the invariants stopped
    // trusting a proposed item's domain the two halves disagreed: the
    // scheduler placed a 30-minute "nutrition" action on consecutive days
    // because nothing labelled `training` was involved, and the invariant then
    // counted those days as consecutive training days and refused the whole
    // week. An ordinary proposal — "30 Minuten Meal-Prep, 3× die Woche" — left
    // people looking at "Plan nicht möglich" on every screen, permanently, and
    // told them it was because of five consecutive training days.
    //
    // The scheduler is the right place for it: an invariant should verify what
    // the scheduler already refused to build, never be the first thing to
    // notice. Below the strenuous threshold an action is a reminder or a short
    // habit, and those may sit on consecutive days.
    const needsRecovery = action.minutes >= PROPOSED_STRENUOUS_MINUTES
    const days = needsRecovery
      ? trainingDays.slice(0, action.timesPerWeek)
      // The duration decides which days are open to it. Five minutes of
      // breathing fits on the evening somebody plays football; twenty-five
      // minutes of yoga does not, and this is where the difference is made
      // rather than assumed.
      : pickDays(ctx, action.timesPerWeek, action.minutes)

    if (days.length === 0) continue

    const minutes =
      action.minutes === 0
        ? null
        : Math.max(
            MIN_VIABLE_SESSION_MINUTES,
            ctx.sessionMinutesCap === null
              ? action.minutes
              : Math.min(action.minutes, ctx.sessionMinutesCap),
          )

    for (const day of days) {
      items.push({
        scheduledOn: dateOf(ctx, day),
        domain: action.domain,
        track: 'goal',
        title: action.title,
        plannedDurationMin: minutes,
        timeSlot: resolveSlot(ctx, day, action.preferredSlot),
        rationale: {
          text: action.reasoning,
          // Named so the user can see this came from the model rather than the
          // rulebook, and so a bug here is traceable in stored rows.
          basedOn: ['ai.proposal', 'goal.rawText'],
        },
        details: {
          kind: 'ai_proposed',
          timesPerWeek: action.timesPerWeek,
          // What the action does, kept beside the reasoning rather than merged
          // into it. They answer different questions — "warum ich" and "warum
          // überhaupt" — and a screen that runs them together loses the second,
          // which is the one that makes this something other than instructions
          // from an authority.
          ...(action.effect ? { effect: action.effect } : {}),
        },
      })
    }
  }

  return items
}

/**
 * Which days a proposal may put training on.
 *
 * Riding along with the archetype where there is one; otherwise as many days as
 * the rest-day minimum leaves, spread so no run of training days grows too
 * long. Either way this is the *only* source of training days for a proposal,
 * so no path exists by which the model adds load the recovery rules did not
 * account for.
 */
function trainingBudget(ctx: PlanContext, existing: Weekday[]): Weekday[] {
  if (existing.length > 0) return existing

  const experience = ctx.experience
  const maxDays = Math.max(0, 7 - MIN_REST_DAYS[experience])
  return spreadAcrossWeek(ctx.availableDays, Math.min(maxDays, ctx.availableDays.length))
}

/** The weekdays a set of items already places training on. */
export function trainingDaysOf(items: PlannedItem[]): Weekday[] {
  return [
    ...new Set(
      items.filter((i) => i.domain === 'training').map((i) => weekdayOf(i.scheduledOn)),
    ),
  ]
}

/**
 * A learned time-of-day preference outranks the model's guess: the rule came
 * from this person's own behaviour, the guess came from a sentence.
 */
function resolveSlot(
  ctx: PlanContext,
  day: Parameters<typeof dateOf>[1],
  preferred: TimeSlot | 'any',
): TimeSlot | null {
  if (ctx.rules.preferredSlot) return slotOf(ctx.input, day, ctx.rules.preferredSlot)
  if (preferred !== 'any') return preferred
  return slotOf(ctx.input, day)
}

/**
 * The model's words on the archetype's sessions.
 *
 * The hole this closes was the whole of "die KI versteckt alles". A
 * body-composition goal owns training, movement and nutrition — every domain a
 * weight-loss proposal naturally lands in — so on the real account all three
 * proposed actions, including "45 Minuten Krafttraining im Gym", were filtered
 * out before they were ever placed. Insights listed them under "Was die KI
 * beiträgt"; the plan could not contain a single one of them, that week or any
 * week. The app described a plan it was structurally unable to make.
 *
 * The restriction itself is right and stays: a proposal may not *add* load to a
 * domain whose limits an archetype is counting. What it may do is say what the
 * session already in the plan actually is. That is the split CLAUDE.md asks
 * for — the code holds the limits, the model supplies the judgement:
 *
 *   * the archetype decides **that** there are two 45-minute sessions, on which
 *     days, with which rest days between them;
 *   * the model decides **what** they are — "45 Minuten Krafttraining im Gym"
 *     rather than a generic session — and why they help this person.
 *
 * So nothing here may touch a day, a duration, a domain or a count. Every
 * invariant counts exactly what it counted before, because the same items are
 * still there in the same places. Only the title and the reasoning change.
 *
 * And only on sessions. An item without a duration is a standing rule or a
 * computed target — a calorie corridor, a bedtime — and its title carries a
 * number that safety depends on. **The model may name a session; it may never
 * rewrite a value.**
 */
export function shapeOwnedDomains(
  items: PlannedItem[],
  actions: ProposedAction[],
  archetype: GoalArchetype,
): { items: PlannedItem[]; shaped: number } {
  const shapeable = (item: PlannedItem) =>
    item.track === 'goal' &&
    item.cadence !== 'daily' &&
    item.plannedDurationMin !== null &&
    item.details.kind !== 'ai_proposed' &&
    item.details.kind !== 'ai_shaped'

  const next = [...items]
  let shaped = 0

  for (const action of actions) {
    // Open domains are placed as actions of their own; this is only for the
    // ones that would otherwise be dropped.
    if (isOpenDomain(archetype, action.domain)) continue
    if (action.minutes <= 0) continue

    let left = action.timesPerWeek
    for (let i = 0; i < next.length && left > 0; i++) {
      const item = next[i]
      if (item.domain !== action.domain || !shapeable(item)) continue

      next[i] = {
        ...item,
        title: action.title,
        rationale: {
          text: action.reasoning,
          // Both sources named, because both are true of this item: the model
          // chose the words, the archetype chose the slot.
          basedOn: [...item.rationale.basedOn, 'ai.proposal'],
        },
        details: {
          ...item.details,
          kind: 'ai_shaped',
          // What the archetype called it, kept whole rather than overwritten.
          //
          // Two jobs. It is the evidence that the load is still the engine's —
          // without it a shaped item is indistinguishable from an invented one.
          // And it is what makes shaping reversible: a person who lowers "2×
          // Krafttraining" to one gets the archetype's own wording back on the
          // other session, rather than a session stuck with a title nobody
          // asked for any more.
          plannedAs: {
            title: item.title,
            why: item.rationale.text,
            basedOn: item.rationale.basedOn,
          },
          ...(action.effect ? { effect: action.effect } : {}),
        },
      }
      left--
      shaped++
    }
  }

  return { items: next, shaped }
}

/**
 * The most times a week any single proposed action may run.
 *
 * Seven, because that is a week. Not a judgement about what is sensible —
 * whether seven of something is sensible depends on what it is, and the rest
 * days, the per-day ceiling and the weekly exertion budget are the code that
 * decides that. This exists only so a stored number can never be nonsense.
 */
export const MAX_TIMES_PER_WEEK = 7

/**
 * The proposal as this person wants it.
 *
 * Applied where the proposal is read, so every consumer — the plan, the
 * adoption into a running week, the Insights list — sees the same actions. A
 * preference honoured in one of those places and not the others is how a
 * setting comes to look broken while being stored perfectly.
 *
 * A request, not an instruction. Asking for five strength sessions does not
 * produce five: `scheduleProposed` still places only on days that survived the
 * exclusions and the rest-day budget, and `assertPlanInvariants` still refuses
 * a week that breaks a limit. What this does is make the *ask* real, so the
 * engine is working from what the person wants rather than from what a model
 * guessed for them.
 */
export function withPreferences(
  proposal: AiProposal,
  preferences: ActionPreferences | null | undefined,
): AiProposal {
  if (!preferences) return proposal

  const actions: ProposedAction[] = []
  for (const action of proposal.actions) {
    const preference = preferences[action.title]
    if (preference && preference.enabled === false) continue
    if (!preference) {
      actions.push(action)
      continue
    }
    actions.push({ ...action, timesPerWeek: wantedTimes(action, preference) })
  }

  return { ...proposal, actions }
}

/** The wanted count, or the model's where the stored one is missing or absurd. */
function wantedTimes(action: ProposedAction, preference: ActionPreference): number {
  const wanted = preference.timesPerWeek
  if (typeof wanted !== 'number' || !Number.isFinite(wanted)) return action.timesPerWeek
  // Rounded rather than rejected: a half is a stored value that got there
  // somehow, and the nearest whole week is what it plainly meant.
  return Math.min(MAX_TIMES_PER_WEEK, Math.max(1, Math.round(wanted)))
}


/**
 * A shaped item, back as the archetype planned it.
 *
 * The exact inverse of the shaping above, and it has to be exact: this runs
 * whenever the wanted count drops, so the difference between "restored" and
 * "nearly restored" is a session that slowly accumulates the model's leftovers.
 * An item that was never shaped is returned untouched.
 */
export function unshape(item: PlannedItem): PlannedItem {
  if (item.details.kind !== 'ai_shaped') return item

  const original = item.details.plannedAs
  if (!original || typeof original !== 'object') return item

  const { title, why, basedOn } = original as Record<string, unknown>
  if (typeof title !== 'string') return item

  // Every key shaping added, and only those. Deleting from a copy rather than
  // destructuring three throwaway names keeps the list of what shaping owns in
  // one readable place.
  const rest = { ...item.details }
  delete rest.kind
  delete rest.plannedAs
  delete rest.effect

  return {
    ...item,
    title,
    rationale: {
      text: typeof why === 'string' ? why : item.rationale.text,
      basedOn: Array.isArray(basedOn)
        ? basedOn.filter((v): v is string => typeof v === 'string')
        : item.rationale.basedOn,
    },
    details: rest,
  }
}
