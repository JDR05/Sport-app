// Endurance: running, cycling, swimming.
//
// The governing limit here is the ten percent rule — weekly volume may grow by
// at most a tenth. It is the single most effective guard against overuse injury,
// and it is the reason this archetype cannot simply reuse the body composition
// planner.

import {
  DEFAULT_HORIZON_WEEKS,
  ENDURANCE_MIN_REST_DAYS,
  MAX_WEEKLY_VOLUME_GROWTH,
  MIN_VIABLE_SESSION_MINUTES,
} from '../constants'
import { addDays, daysBetween, formatGermanDate } from '../dates'
import { PlanInvariantError } from '../errors'
import { horizonFor, withNote } from '../horizon'
import { currentOf } from '../progress'
import {
  bestSlotOn, dateOf, formatDecimal, longestSlotOn, planTrainingDays, restDays, round1,
  slotOf,
  type PlanContext,
} from '../context'
import { bucketSessions, bucketMinutes } from './bodyComposition'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import type { GoalTrack, PlanInput, PlannedItem, PlanResult, Weekday } from '@/lib/domain/types'

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

/** Assumed starting volume when the user gave none — deliberately low. */
const FALLBACK_START_KM = 5

/**
 * The planning pace: six minutes a kilometre.
 *
 * Named because it converts in both directions now — distance to time when
 * there is room, and time back to distance when there is not.
 */
const MIN_PER_KM = 6

/**
 * The long run's share of the week. One session carrying a little under half
 * the volume is the shape endurance plans take; the rest is easy mileage.
 */
const LONG_RUN_SHARE = 0.45

function volumeMetric(input: PlanInput) {
  return input.metrics.find((m) => m.metricKey === 'distance_km' || m.metricKey === 'duration_min')
}

function startVolume(input: PlanInput): number {
  // The volume actually being run now, not the one entered at the beginning.
  // Growth is capped at ten percent a week *from where the person is* — from a
  // stale start value it was capped from somewhere they had already left.
  return currentOf(volumeMetric(input)) ?? FALLBACK_START_KM
}

function targetVolume(input: PlanInput): number {
  return volumeMetric(input)?.targetValue ?? startVolume(input) * 2
}

/** Weeks needed to grow from start to target at no more than ten percent a week. */
export function weeksAtSafeGrowth(start: number, target: number): number {
  if (target <= start) return 0
  return Math.ceil(Math.log(target / start) / Math.log(1 + MAX_WEEKLY_VOLUME_GROWTH))
}

export const endurance: ArchetypeStrategy = {
  archetype: 'endurance',
  label: 'Ausdauer',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const { input } = ctx
    const start = startVolume(input)
    const target = targetVolume(input)
    const safeWeeks = weeksAtSafeGrowth(start, target)

    const weeksRequested = input.goal.targetDate
      ? daysBetween(input.today, input.goal.targetDate) / 7
      : DEFAULT_HORIZON_WEEKS

    if (safeWeeks === 0) {
      // No growth to cap, so the rate check below never runs — which is where
      // a date in the past used to slip through untouched.
      const reached = horizonFor(input.today, input.goal.targetDate, DEFAULT_HORIZON_WEEKS)
      return {
        adjusted: reached.adjusted,
        targetDate: input.goal.targetDate === null ? null : reached.targetDate,
        reason: withNote(reached.note, 'Dein Zielumfang liegt bereits im erreichten Bereich.'),
      }
    }

    if (weeksRequested <= 0 || weeksRequested < safeWeeks) {
      const safeDate = addDays(input.today, safeWeeks * 7)
      return {
        adjusted: true,
        targetDate: safeDate,
        reason:
          `${formatDecimal(target)} km bis zum ${formatGermanDate(safeDate)}. ` +
          `Der Umfang wächst höchstens 10 % pro Woche — schneller aufzubauen ist der ` +
          `häufigste Weg in eine Überlastungsverletzung, und dann dauert es länger.`,
      }
    }

    const { targetDate, adjusted, note } = horizonFor(
      input.today, input.goal.targetDate, Math.ceil(weeksRequested),
    )
    return {
      adjusted,
      targetDate,
      reason: withNote(
        note,
        `${formatDecimal(target)} km bis zum ${formatGermanDate(targetDate)} — ` +
          `mit unter 10 % Steigerung pro Woche gut machbar.`,
      ),
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const { input } = ctx
    const start = startVolume(input)
    const thisWeekKm = round1(start * (1 + MAX_WEEKLY_VOLUME_GROWTH))

    const desired = input.profile.sport.sessionsPerWeekTarget ?? 3

    const { weekdays, planned: sessions } = planTrainingDays(
      ctx, desired, 1, ENDURANCE_MIN_REST_DAYS,
    )

    const clamped = this.clampGoal(ctx)
    ctx.rationale.push({ text: clamped.reason, basedOn: ['goal.targetDate', 'metrics.distance_km'] })

    // The long run goes on the day with the most time, not on a fixed weekday —
    // it is the session most likely to be skipped for lack of an hour.
    let longIndex = 0
    let longestAvailable = -1
    weekdays.forEach((day, index) => {
      const available = longestSlotOn(input, day)
      if (available > longestAvailable) {
        longestAvailable = available
        longIndex = index
      }
    })
    // A single session carries the whole week's volume rather than 45 % of
    // it — the 45/55 split only means something when there is a second
    // session to carry the rest. Without this, one run a week silently lost
    // more than half its distance.
    const longKm = weekdays.length > 1 ? round1(thisWeekKm * LONG_RUN_SHARE) : thisWeekKm
    const easyKm = weekdays.length > 1 ? round1((thisWeekKm - longKm) / (weekdays.length - 1)) : 0

    // What the week actually contains, rather than what the progression would
    // have allowed. The two came apart as soon as the week could hold fewer
    // runs than planned — a person with club training on three evenings got one
    // run of 5.9 km under a headline promising 13.2. Cramming the whole volume
    // into the single remaining session would have been the other way to make
    // the numbers agree, and the wrong one: that is exactly the step increase
    // the volume cap exists to prevent.
    //
    // Duration can be adjusted for two different reasons, and only one of them
    // may change the distance. If the window is the binding constraint — an
    // evening too short for the planned run — the session has to shrink, and
    // its distance shrinks with it: that is `Math.min(wanted, window's reach)`.
    // But a session below MIN_VIABLE_SESSION_MINUTES gets its *time* raised
    // for a different reason — it is not worth leaving the house for seven
    // minutes — and that floor must never be read back into distance. It did:
    // a session budgeted for 3 km had its duration floored to twenty minutes
    // and then its km recomputed from those twenty minutes, silently claiming
    // 3.3 km. Multiplied across several sessions, "22,0 km diese Woche" was
    // shown over sessions that between them held 13,3 km, and — the sharper
    // failure — a beginner's week came out over the ten percent cap while the
    // invariant that exists to catch exactly that read it as compliant.
    const planned = weekdays.map((day, index) => {
      const wanted = index === longIndex ? longKm : easyKm
      const window = longestSlotOn(input, day)
      const naturalMinutes = Math.round(wanted * MIN_PER_KM)
      const minutes = Math.min(
        Math.max(MIN_VIABLE_SESSION_MINUTES, naturalMinutes),
        Math.max(MIN_VIABLE_SESSION_MINUTES, window),
      )
      const km = round1(Math.min(wanted, minutes / MIN_PER_KM))
      return { day, index, minutes, km }
    })

    const plannedKm = round1(planned.reduce((sum, s) => sum + s.km, 0))
    const longestKm = planned.length > 0 ? Math.max(...planned.map((s) => s.km)) : 0

    const items: PlannedItem[] = planned.map(({ day, index, minutes, km }) => {
      const isLong = index === longIndex
      const slot = bestSlotOn(input, day, ctx.rules.preferredSlot)
      return {
        scheduledOn: dateOf(ctx, day),
        domain: 'training' as const,
        track: 'goal' as const,
        title: isLong ? `Langer Lauf, ${formatDecimal(km)} km` : `Lockerer Lauf, ${formatDecimal(km)} km`,
        plannedDurationMin: minutes,
        timeSlot: slotOf(input, day, ctx.rules.preferredSlot),
        rationale: {
          text: isLong
            ? `${WEEKDAY_LABEL[day]}${slot ? ` ${slot.start}` : ''} — die längste Einheit der Woche, ` +
              `weil du an diesem Tag am meisten Zeit hast.`
            : `${WEEKDAY_LABEL[day]}${slot ? ` ${slot.start}` : ''} — locker, im Gesprächstempo. ` +
              `Die leichten Einheiten bauen die Grundlage, nicht die harten.`,
          basedOn: [`schedule.freeSlots.${day}`, 'profile.sport.sessionsPerWeekTarget'],
        },
        details: { km, intensity: isLong ? 'long' : 'easy', weeklyKm: plannedKm },
      }
    })

    return {
      archetype: 'endurance',
      headline: `${formatDecimal(plannedKm)} km · ${sessions}× diese Woche`,
      summary: [
        `${sessions}× laufen, zusammen ${formatDecimal(plannedKm)} km`,
        `Längste Einheit ${formatDecimal(longestKm)} km`,
        `${restDays(weekdays).length} Ruhetage`,
      ],
      items,
      signature: {
        sessionsBucket: bucketSessions(sessions),
        weekdayPattern: weekdays.join('-') || 'none',
        volumeBucket: String(Math.floor(plannedKm / 5) * 5),
        longRunShare: plannedKm > 0 ? String(Math.round((longestKm / plannedKm) * 10)) : '0',
        longDay: weekdays[longIndex] ?? 'none',
        sessionLength: bucketMinutes(items[0]?.plannedDurationMin ?? 0),
        longSessionLength: bucketMinutes(items[longIndex]?.plannedDurationMin ?? 0),
        pacing: input.profile.sport.experience ?? 'beginner',
      },
    }
  },

  assertInvariants(plan: PlanResult, input: PlanInput): void {
    const enduranceItems = plan.strategy.goalTrack.items.filter(
      (i) => i.domain === 'training',
    )
    const weeklyKm = enduranceItems.reduce(
      (sum, i) => sum + Number(i.details.km ?? 0),
      0,
    )
    const start = startVolume(input)
    const cap = start * (1 + MAX_WEEKLY_VOLUME_GROWTH)

    // Half a kilometre of slack absorbs rounding across several sessions.
    if (weeklyKm > cap + 0.5) {
      throw new PlanInvariantError(
        `endurance: weekly volume ${round1(weeklyKm)} km exceeds the ten percent cap of ${round1(cap)} km`,
      )
    }

    const trainingDays = new Set(enduranceItems.map((i) => i.scheduledOn))
    if (trainingDays.size > 7 - ENDURANCE_MIN_REST_DAYS) {
      throw new PlanInvariantError(
        `endurance: ${trainingDays.size} training days leaves fewer than ${ENDURANCE_MIN_REST_DAYS} rest days`,
      )
    }
  },
}
