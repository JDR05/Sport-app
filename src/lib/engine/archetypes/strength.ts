// Strength and muscle.
//
// The governing limits are recovery-shaped rather than energy-shaped: never two
// heavy sessions for the same muscle group back to back, and a modest weekly
// load progression.

import {
  DEFAULT_HORIZON_WEEKS,
  MAX_WEEKLY_LOAD_GROWTH,
  MIN_REST_DAYS,
  STRENGTH_MIN_DAYS_BETWEEN_HEAVY,
} from '../constants'
import { addDays, daysBetween, formatGermanDate } from '../dates'
import { PlanInvariantError } from '../errors'
import {
  bestSlotOn, dateOf, longestRun, restDays, slotOf, spreadAcrossWeek,
  type PlanContext,
} from '../context'
import { bucketSessions, bucketMinutes, pickModality, pickSessionMinutes } from './bodyComposition'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import type { GoalTrack, PlanInput, PlannedItem, PlanResult, Weekday } from '@/lib/domain/types'

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

const SPLIT = ['Unterkörper', 'Oberkörper drücken', 'Oberkörper ziehen'] as const

export const strength: ArchetypeStrategy = {
  archetype: 'strength',
  label: 'Kraft und Muskelaufbau',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const { input } = ctx
    const metric = input.metrics[0]
    const start = metric?.startValue ?? 0
    const target = metric?.targetValue ?? 0

    const weeksRequested = input.goal.targetDate
      ? daysBetween(input.today, input.goal.targetDate) / 7
      : DEFAULT_HORIZON_WEEKS

    const safeWeeks =
      start > 0 && target > start
        ? Math.ceil(Math.log(target / start) / Math.log(1 + MAX_WEEKLY_LOAD_GROWTH))
        : 0

    if (safeWeeks > 0 && (weeksRequested <= 0 || weeksRequested < safeWeeks)) {
      const safeDate = addDays(input.today, safeWeeks * 7)
      return {
        adjusted: true,
        targetDate: safeDate,
        reason:
          `Erreichbar bis zum ${formatGermanDate(safeDate)}. Kraft wächst über Wochen, ` +
          `nicht über Tage — mehr als etwa 5 % Steigerung pro Woche geht auf Kosten der Technik.`,
      }
    }

    const targetDate = input.goal.targetDate ?? addDays(input.today, DEFAULT_HORIZON_WEEKS * 7)
    return {
      adjusted: false,
      targetDate,
      reason:
        `Bis zum ${formatGermanDate(targetDate)} mit stetiger, kleiner Steigerung — ` +
        `das ist der Weg, der hält.`,
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const { input, experience } = ctx
    const desired = input.profile.sport.sessionsPerWeekTarget ?? (experience === 'beginner' ? 2 : 3)
    const maxByRest = 7 - MIN_REST_DAYS[experience]
    const sessions = Math.max(1, Math.min(desired, Math.max(1, ctx.availableDays.length), maxByRest))
    const weekdays = spreadAcrossWeek(ctx.availableDays, sessions)

    const modality = pickModality(input)
    const sessionMinutes = pickSessionMinutes(ctx, weekdays)

    const clamped = this.clampGoal(ctx)
    ctx.rationale.push({ text: clamped.reason, basedOn: ['goal.targetDate'] })

    // Beginners train the whole body each session; more sessions justify a split.
    //
    // A split is also forced when the only free days are adjacent — someone with
    // just Saturday and Sunday cannot do full body twice in a row without
    // breaking recovery. Splitting the body is the right answer there; dropping
    // the second session would be the lazy one.
    const adjacentDays = longestRun(weekdays) > 1
    const useSplit = (sessions >= 3 && experience !== 'beginner') || adjacentDays

    if (adjacentDays && weekdays.length > 1) {
      ctx.rationale.push({
        text:
          `Deine freien Tage liegen direkt nebeneinander. Damit trotzdem beide Einheiten ` +
          `stattfinden können, sind sie nach Muskelgruppen aufgeteilt — dieselbe Gruppe zweimal ` +
          `hintereinander schwer zu belasten bringt nichts.`,
        basedOn: ['schedule.freeSlots'],
      })
    }

    const items: PlannedItem[] = weekdays.map((day, index) => {
      const focus = useSplit ? SPLIT[index % SPLIT.length] : 'Ganzkörper'
      const slot = bestSlotOn(input, day)
      return {
        scheduledOn: dateOf(ctx, day),
        domain: 'training' as const,
        track: 'goal' as const,
        title: modality === 'gym' ? `Krafttraining · ${focus}` : `Krafttraining ohne Geräte · ${focus}`,
        plannedDurationMin: sessionMinutes,
        timeSlot: slotOf(input, day),
        rationale: {
          text:
            `${WEEKDAY_LABEL[day]}${slot ? ` ${slot.start}` : ''}, ${sessionMinutes} Min. ` +
            (useSplit
              ? `Aufgeteilt nach Muskelgruppen, damit zwischen zwei schweren Einheiten für dieselbe Gruppe mindestens ${STRENGTH_MIN_DAYS_BETWEEN_HEAVY} Tage liegen.`
              : `Ganzkörper — bei ${sessions} Einheiten pro Woche bringt das mehr als ein Split.`),
          basedOn: [`schedule.freeSlots.${day}`, 'profile.sport.experience', 'profile.sport.equipment'],
        },
        details: { focus, modality, split: useSplit },
      }
    })

    return {
      archetype: 'strength',
      headline: `${sessions}× Kraft à ${sessionMinutes} Min`,
      summary: [
        `${sessions}× Krafttraining à ${sessionMinutes} Min`,
        useSplit ? 'Aufgeteilt nach Muskelgruppen' : 'Ganzkörper pro Einheit',
        `${restDays(weekdays).length} Ruhetage`,
      ],
      items,
      signature: {
        sessionsBucket: bucketSessions(sessions),
        weekdayPattern: weekdays.join('-') || 'none',
        modality,
        sessionLength: bucketMinutes(sessionMinutes),
        structure: useSplit ? 'split' : 'fullbody',
        forcedSplit: adjacentDays ? 'yes' : 'no',
      },
    }
  },

  assertInvariants(plan: PlanResult, input: PlanInput): void {
    const items = plan.strategy.goalTrack.items
    const days = items.map((i) => i.scheduledOn).sort()

    const experience = input.profile.sport.experience ?? 'beginner'
    if (7 - days.length < MIN_REST_DAYS[experience]) {
      throw new PlanInvariantError(
        `strength: ${days.length} training days leaves fewer than ${MIN_REST_DAYS[experience]} rest days`,
      )
    }

    // Same focus twice in a row would put two heavy sessions on one muscle group
    // without the required recovery in between.
    for (let i = 1; i < items.length; i++) {
      const gap = (Date.parse(items[i].scheduledOn) - Date.parse(items[i - 1].scheduledOn)) / 86_400_000
      if (items[i].details.focus === items[i - 1].details.focus && gap < STRENGTH_MIN_DAYS_BETWEEN_HEAVY) {
        throw new PlanInvariantError(
          `strength: "${items[i].details.focus}" repeats after ${gap} day(s), ` +
            `fewer than the required ${STRENGTH_MIN_DAYS_BETWEEN_HEAVY}`,
        )
      }
    }

    const weekdays = plan.strategy.goalTrack.signature.weekdayPattern
    if (weekdays !== 'none' && longestRun(weekdays.split('-') as Weekday[]) > 3) {
      throw new PlanInvariantError('strength: more than three consecutive training days')
    }
  },
}
