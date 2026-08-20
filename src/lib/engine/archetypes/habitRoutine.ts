// Habits, focus and routines.
//
// One Change at a Time, taken literally: exactly one new habit at a time. More
// than one is the most reliable way to end up with none. No streak mechanics —
// a counter that resets punishes exactly the moment a person most needs to keep
// going.

import {
  DEFAULT_HORIZON_WEEKS,
  HABIT_MAX_MINUTES,
  HABIT_MIN_MINUTES,
  MAX_NEW_HABITS_AT_ONCE,
} from '../constants'
import { addDays, formatGermanDate } from '../dates'
import { PlanInvariantError } from '../errors'
import { dateOf, slotOf, type PlanContext } from '../context'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import { WEEKDAYS, type GoalTrack, type PlannedItem, type PlanResult, type Weekday } from '@/lib/domain/types'

/** Anchoring a new habit to something that already happens daily is what makes it stick. */
function anchorFor(ctx: PlanContext): { kind: string; text: string; basedOn: string } {
  const routines = ctx.input.profile.mind.existingRoutines
  // An explicit routine the person already has beats a generic wake-up anchor.
  if (routines.length > 0) {
    return { kind: 'routine', text: `direkt nach „${routines[0]}"`, basedOn: 'profile.mind.existingRoutines' }
  }
  const wake = ctx.input.profile.sleep.usualWakeTime
  if (wake) {
    return { kind: 'wake', text: `direkt nach dem Aufstehen um ${wake}`, basedOn: 'profile.sleep.usualWakeTime' }
  }
  const slot = ctx.input.schedule.freeSlots[0]
  if (slot) {
    return { kind: 'freeslot', text: `in deinem freien Fenster um ${slot.start}`, basedOn: 'schedule.freeSlots' }
  }
  return { kind: 'none', text: 'zur immer gleichen Tageszeit', basedOn: 'goal.rawText' }
}

/**
 * Daily is the strongest cadence, but an irregular week cannot sustain it. On a
 * shift or irregular schedule the habit runs on the days the person is reliably
 * free — fewer days that hold beat seven that break.
 */
function habitDays(ctx: PlanContext): { days: readonly Weekday[]; cadence: string } {
  const pattern = ctx.input.schedule.workPattern
  if (pattern === 'shift' || pattern === 'irregular') {
    const free = ctx.availableDays
    if (free.length > 0) return { days: free, cadence: 'free_days' }
  }
  return { days: WEEKDAYS, cadence: 'daily' }
}

/** Early, mid or late riser — it decides when the habit can realistically sit. */
function wakeBucket(ctx: PlanContext): string {
  const wake = ctx.input.profile.sleep.usualWakeTime
  if (!wake) return 'unknown'
  const hour = Number(wake.slice(0, 2)) + Number(wake.slice(3, 5)) / 60
  if (hour < 6.5) return 'early'
  if (hour <= 8) return 'mid'
  return 'late'
}

function screenBucket(ctx: PlanContext): string {
  const hours = ctx.input.profile.mind.screenTimeHoursPerDay
  if (hours === null) return 'unknown'
  if (hours < 3) return 'low'
  if (hours < 5) return 'mid'
  return 'high'
}

function habitMinutes(ctx: PlanContext): number {
  const struggle = ctx.input.profile.mind.focusStruggle
  // Someone who struggles with focus gets the smallest possible version. A habit
  // too small to fail beats one too big to start.
  if (struggle === 'high') return HABIT_MIN_MINUTES
  if (struggle === 'medium') return 10
  return 15
}

export const habitRoutine: ArchetypeStrategy = {
  archetype: 'habit_routine',
  label: 'Gewohnheit und Routine',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const targetDate =
      ctx.input.goal.targetDate ?? addDays(ctx.input.today, DEFAULT_HORIZON_WEEKS * 7)
    return {
      adjusted: false,
      targetDate,
      reason:
        `Eine Gewohnheit zur Zeit, bis zum ${formatGermanDate(targetDate)}. ` +
        `Zwei gleichzeitig anzufangen ist der zuverlässigste Weg, am Ende keine zu haben.`,
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const { input } = ctx
    const minutes = habitMinutes(ctx)
    const anchor = anchorFor(ctx)
    const screenTime = input.profile.mind.screenTimeHoursPerDay

    // The habit itself comes from the user's own words — the AI layer refines
    // the wording later, but the structure is deterministic.
    const habitLabel = input.goal.rawText.trim().length > 0
      ? input.goal.rawText.trim()
      : 'deine neue Gewohnheit'

    ctx.rationale.push({ text: this.clampGoal(ctx).reason, basedOn: ['goal.rawText'] })
    ctx.rationale.push({
      text:
        `${minutes} Minuten täglich, ${anchor.text}. Klein genug, dass ein schlechter Tag sie ` +
        `nicht kippt — genau das ist der Punkt.`,
      basedOn: ['profile.mind.focusStruggle', anchor.basedOn],
    })

    const { days, cadence } = habitDays(ctx)
    const items: PlannedItem[] = days.map((day) => ({
      scheduledOn: dateOf(ctx, day),
      domain: 'self_improvement' as const,
      track: 'goal' as const,
      title: `${minutes} Min: ${habitLabel}`,
      plannedDurationMin: minutes,
      timeSlot: anchor.kind === 'wake' ? 'early' : slotOf(input, day, ctx.rules.preferredSlot),
      rationale: {
        text: `${anchor.text.charAt(0).toUpperCase()}${anchor.text.slice(1)} — jeden Tag zur gleichen Zeit.`,
        basedOn: [anchor.basedOn, 'profile.mind.focusStruggle'],
      },
      details: { habit: habitLabel, minutes, anchored: true, newHabit: true },
    }))

    const screens = screenBucket(ctx)
    if (screenTime !== null && screenTime >= 4) {
      items.push({
        scheduledOn: dateOf(ctx, 'sun'),
        domain: 'self_improvement',
        track: 'goal',
        title: 'Bildschirmzeit der Woche anschauen',
        plannedDurationMin: 5,
        timeSlot: 'evening',
        rationale: {
          text:
            `Du hast rund ${screenTime} Stunden Bildschirmzeit am Tag angegeben — das ist ` +
            `${screens === 'high' ? 'viel, und genau deshalb lohnt sich der Blick' : 'im mittleren Bereich'}. ` +
            `Einmal pro Woche hinschauen reicht: beobachten, nicht bewerten.`,
          basedOn: ['profile.mind.screenTimeHoursPerDay'],
        },
        details: { kind: 'observation', newHabit: false },
      })
    }

    return {
      archetype: 'habit_routine',
      headline: `${minutes} Min täglich · eine Gewohnheit`,
      summary: [
        `${habitLabel} — ${minutes} Min`,
        `Verankert: ${anchor.text}`,
        cadence === 'daily' ? 'Täglich, ohne Streak-Zählung' : 'An deinen freien Tagen, ohne Streak-Zählung',
      ],
      items,
      signature: {
        minutesBucket: String(minutes),
        anchor: anchor.kind,
        cadence,
        dayPattern: days.join('-'),
        timeSlot: anchor.kind === 'wake' ? 'early' : (slotOf(input, days[0], ctx.rules.preferredSlot) ?? 'none'),
        wakeBucket: wakeBucket(ctx),
        screenBucket: screens,
        observation: screenTime !== null && screenTime >= 4 ? 'screen_time' : 'none',
        focusLevel: input.profile.mind.focusStruggle ?? 'unknown',
      },
    }
  },

  assertInvariants(plan: PlanResult): void {
    // Habit items only, for the same reason as nutrition: the rule is "one new
    // habit at a time", not "one action at a time".
    const items = plan.strategy.goalTrack.items.filter(
      (i) => i.domain === 'self_improvement',
    )
    const newHabits = new Set(
      items.filter((i) => i.details.newHabit === true).map((i) => String(i.details.habit)),
    )

    if (newHabits.size > MAX_NEW_HABITS_AT_ONCE) {
      throw new PlanInvariantError(
        `habit_routine: ${newHabits.size} new habits at once exceeds the cap of ${MAX_NEW_HABITS_AT_ONCE}`,
      )
    }

    for (const item of items) {
      const minutes = item.plannedDurationMin
      if (item.details.newHabit === true && minutes !== null) {
        if (minutes < HABIT_MIN_MINUTES || minutes > HABIT_MAX_MINUTES) {
          throw new PlanInvariantError(
            `habit_routine: "${item.title}" is ${minutes} min, outside ${HABIT_MIN_MINUTES}–${HABIT_MAX_MINUTES}`,
          )
        }
      }
      if ('streak' in item.details || /streak|serie|tage am stück/i.test(item.title)) {
        throw new PlanInvariantError(
          `habit_routine: "${item.title}" introduces streak mechanics, which are forbidden`,
        )
      }
    }
  },
}
