// Strength and muscle.
//
// The governing limits are recovery-shaped rather than energy-shaped: never two
// heavy sessions for the same muscle group back to back, and a modest weekly
// load progression.

import {
  STRENGTH_ACTIVITIES,
  DEFAULT_HORIZON_WEEKS,
  MAX_WEEKLY_LOAD_GROWTH,
  MIN_REST_DAYS,
  STRENGTH_MIN_DAYS_BETWEEN_HEAVY,
} from '../constants'
import { addDays, daysBetween, formatGermanDate } from '../dates'
import { PlanInvariantError } from '../errors'
import { horizonFor, withNote } from '../horizon'
import { currentOf } from '../progress'
import {
  bestSlotOn, dateOf, longestRun, planTrainingDays, restDays, slotOf,
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
    const start = currentOf(metric) ?? 0
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

    // Nothing to cap — no metric, or the target is already reached. The date
    // still has to be one the plan can work towards.
    const { targetDate, adjusted, note } = horizonFor(
      input.today, input.goal.targetDate, DEFAULT_HORIZON_WEEKS,
    )
    return {
      adjusted,
      targetDate,
      reason: withNote(
        note,
        `Bis zum ${formatGermanDate(targetDate)} mit stetiger, kleiner Steigerung — ` +
          `das ist der Weg, der hält.`,
      ),
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const { input, experience } = ctx
    const desired = input.profile.sport.sessionsPerWeekTarget ?? (experience === 'beginner' ? 2 : 3)
    // At least one session, unless the week genuinely has no room: a strength
    // plan with no strength in it is not a strength plan.
    // Football does not replace a strength session. It costs recovery and it
    // counts against the rest days — both handled inside planTrainingDays —
    // but a week with two club evenings still has room for the gym work this
    // goal is actually about.
    const { weekdays, planned: sessions } = planTrainingDays(
      ctx, desired, 1, undefined, STRENGTH_ACTIVITIES,
    )

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

    // The week is already full of this person's own training.
    //
    // Five club evenings leaves no room inside the rest-day budget for a sixth
    // training day, and the honest answer is not to add one. It is also not to
    // produce nothing: an archetype with no goal action at all fails an
    // invariant and puts "Plan nicht möglich" on every screen — the same
    // permanent dead end ADR-092 describes, reached from a different direction
    // by somebody whose only mistake was training a lot.
    //
    // So the goal track becomes the part of getting stronger that costs no
    // recovery: eating enough protein to build on the training that is already
    // happening. Additive, safe on a full week, and true to the goal.
    if (weekdays.length === 0) {
      ctx.rationale.push({
        text:
          `Deine Woche ist mit deinen eigenen Trainingsterminen schon voll — mehr Einheiten ` +
          `wären keine Steigerung, sondern nur weniger Erholung. Der Plan legt deshalb nichts ` +
          `obendrauf und setzt bei dem an, was die vorhandenen Einheiten wirken lässt.`,
        basedOn: ['schedule.commitments'],
      })

      return {
        archetype: 'strength',
        headline: 'Deine Einheiten stehen schon — Fokus auf Erholung',
        summary: [
          'Kein zusätzliches Training: deine Woche ist voll',
          'Eiweiß zu jeder Hauptmahlzeit',
          `${restDays([]).length} Tage ohne festes Training von der App`,
        ],
        items: [
          {
            scheduledOn: dateOf(ctx, ctx.availableDays[0] ?? 'mon'),
            domain: 'nutrition' as const,
            track: 'goal' as const,
            title: 'Eiweiß zu jeder Hauptmahlzeit',
            plannedDurationMin: null,
            timeSlot: null,
            cadence: 'daily' as const,
            rationale: {
              text:
                'Du trainierst schon so viel, wie in deine Woche passt. Was dann noch zählt, ' +
                'ist genug Eiweiß über den Tag verteilt — daraus wird der Muskel gebaut, den ' +
                'das Training anfordert.',
              basedOn: ['schedule.commitments', 'goal.rawText'],
            },
            details: { focus: 'recovery', modality, split: false },
          },
        ],
        signature: {
          sessionsBucket: bucketSessions(0),
          weekdayPattern: 'none',
          modality,
          sessionLength: bucketMinutes(sessionMinutes),
          structure: 'none',
          forcedSplit: 'no',
        },
      }
    }

    const items: PlannedItem[] = weekdays.map((day, index) => {
      const focus = useSplit ? SPLIT[index % SPLIT.length] : 'Ganzkörper'
      const slot = bestSlotOn(input, day, ctx.rules.preferredSlot)
      return {
        scheduledOn: dateOf(ctx, day),
        domain: 'training' as const,
        track: 'goal' as const,
        title: modality === 'gym' ? `Krafttraining · ${focus}` : `Krafttraining ohne Geräte · ${focus}`,
        plannedDurationMin: sessionMinutes,
        timeSlot: slotOf(input, day, ctx.rules.preferredSlot),
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
    // Training items only. A mobility reminder is not a strength session and
    // must not count against the rest-day budget.
    const items = plan.strategy.goalTrack.items.filter((i) => i.domain === 'training')
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
