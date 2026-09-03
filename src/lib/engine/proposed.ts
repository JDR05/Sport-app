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
  GoalArchetype, PlanDomain, PlannedItem, ProposedAction, TimeSlot, Weekday,
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
