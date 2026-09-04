// Sleep and recovery.
//
// One rule dominates this archetype and is worth stating plainly: the app may
// never recommend less sleep. Not to fit a workout in, not to free up time, not
// under any goal. Everything else here is built around protecting that.

import {
  DEFAULT_HORIZON_WEEKS,
  MAX_BEDTIME_SHIFT_MIN_PER_WEEK,
  MAX_SLEEP_HOURS,
  MIN_SLEEP_HOURS,
} from '../constants'
import { formatGermanDate } from '../dates'
import { PlanInvariantError } from '../errors'
import { dateOf, type PlanContext } from '../context'
import { horizonFor, withNote } from '../horizon'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import { WEEKDAYS, type GoalTrack, type PlanInput, type PlannedItem, type PlanResult } from '@/lib/domain/types'

const DEFAULT_BEDTIME = '23:00'
const DEFAULT_WAKE = '07:00'

/** The window assumed around a time somebody did give. Eight hours, in minutes. */
const DEFAULT_WINDOW_HOURS = 8
const DEFAULT_WINDOW_MIN = DEFAULT_WINDOW_HOURS * 60

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function sleepWindowHours(bedtime: string, wake: string): number {
  const diff = (toMinutes(wake) - toMinutes(bedtime) + 1440) % 1440
  return diff / 60
}

export const sleepRecovery: ArchetypeStrategy = {
  archetype: 'sleep_recovery',
  label: 'Schlaf und Erholung',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const { targetDate, adjusted, note } = horizonFor(
      ctx.input.today, ctx.input.goal.targetDate, DEFAULT_HORIZON_WEEKS,
    )
    return {
      adjusted,
      targetDate,
      reason: withNote(
        note,
        `Schlaf verändert sich langsam. Bis zum ${formatGermanDate(targetDate)} verschieben ` +
          `wir deine Zeiten in kleinen Schritten von höchstens ${MAX_BEDTIME_SHIFT_MIN_PER_WEEK} Minuten pro Woche — ` +
          `alles andere hält kein Mensch durch.`,
      ),
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const { input } = ctx
    const sleep = input.profile.sleep

    // A missing time is derived from the one that is there, not from a default
    // that ignores it.
    //
    // Pairing somebody's real 10:00 wake-up with a default 23:00 bedtime
    // invents an eleven-hour night, and the app then treats that invention as
    // this person's sleep: the window is "already long", so nothing is planned,
    // and the guard that stops the app extending anybody's sleep past nine
    // hours fires on a number nobody gave it. Measured over 7000 generated
    // people, this was the last remaining way the plan refused to build at all.
    //
    // Deriving from the known end keeps the assumption honest — it says "we
    // assumed the other side of the night you told us about" rather than
    // "we assumed your night".
    const known = sleep.usualBedtime ?? sleep.usualWakeTime
    const currentBed =
      sleep.usualBedtime ??
      (sleep.usualWakeTime ? toClock(toMinutes(sleep.usualWakeTime) - DEFAULT_WINDOW_MIN) : DEFAULT_BEDTIME)
    const currentWake =
      sleep.usualWakeTime ??
      (sleep.usualBedtime ? toClock(toMinutes(sleep.usualBedtime) + DEFAULT_WINDOW_MIN) : DEFAULT_WAKE)

    if (sleep.usualBedtime === null || sleep.usualWakeTime === null) {
      ctx.assumptions.push({
        field: sleep.usualBedtime === null ? 'profile.sleep.usualBedtime' : 'profile.sleep.usualWakeTime',
        assumed: `${currentBed} bis ${currentWake}`,
        reason: known
          ? `Nur eine der beiden Zeiten angegeben. Die App rechnet mit einem ${DEFAULT_WINDOW_HOURS}-Stunden-Fenster ` +
            `um die Zeit herum, die du genannt hast, und passt es an, sobald die zweite dazukommt.`
          : 'Keine Schlafzeiten angegeben. Die App rechnet mit einem durchschnittlichen Fenster und passt es an, sobald du echte Zeiten einträgst.',
      })
    }

    const currentHours = sleepWindowHours(currentBed, currentWake)

    // If the window is already short, move bedtime EARLIER — never wake later
    // and never shorten. The shift is capped so the change is survivable.
    const deficitMin = Math.max(0, MIN_SLEEP_HOURS * 60 - currentHours * 60)
    const shiftMin = Math.min(deficitMin, MAX_BEDTIME_SHIFT_MIN_PER_WEEK)
    const targetBed = toClock(toMinutes(currentBed) - shiftMin)
    const targetHours = sleepWindowHours(targetBed, currentWake)

    ctx.rationale.push({ text: this.clampGoal(ctx).reason, basedOn: ['profile.sleep.usualBedtime'] })
    if (shiftMin > 0) {
      ctx.rationale.push({
        text:
          `Dein Fenster liegt aktuell bei ${currentHours.toFixed(1)} Stunden. Diese Woche geht ` +
          `die Schlafenszeit ${shiftMin} Minuten nach vorn auf ${targetBed} — die Aufstehzeit bleibt, ` +
          `wo sie ist. Die App verkürzt deinen Schlaf unter keinen Umständen.`,
        basedOn: ['profile.sleep.usualBedtime', 'profile.sleep.usualWakeTime'],
      })
    }

    const items: PlannedItem[] = []
    const make = (dayIndex: number, title: string, text: string, basedOn: string[], details: Record<string, unknown>) => {
      items.push({
        scheduledOn: dateOf(ctx, WEEKDAYS[dayIndex]),
        domain: 'sleep',
        track: 'goal',
        title,
        plannedDurationMin: null,
        timeSlot: 'evening',
        rationale: { text, basedOn },
        details,
      })
    }

    // A daily anchor: the same bedtime every day is what actually moves sleep.
    for (let i = 0; i < WEEKDAYS.length; i++) {
      make(i, `Licht aus um ${targetBed}`,
        `Gleiche Zeit an allen sieben Tagen — Regelmäßigkeit wirkt bei Schlaf stärker als Dauer. ` +
        `Aufstehen bleibt bei ${currentWake}.`,
        ['profile.sleep.usualBedtime', 'profile.sleep.usualWakeTime'],
        { targetBedtime: targetBed, targetWake: currentWake, targetHours })
    }

    if (sleep.screenBeforeBed !== false) {
      make(0, 'Bildschirm 30 Min vor dem Schlafen weglegen',
        sleep.screenBeforeBed === true
          ? 'Du hast angegeben, vor dem Schlafen noch am Bildschirm zu sein — das ist der Hebel mit dem besten Verhältnis von Aufwand zu Wirkung.'
          : 'Standardempfehlung, solange du nichts anderes angibst.',
        ['profile.sleep.screenBeforeBed'],
        { kind: 'wind_down' })
    }

    // A poor sleeper needs the wind-down anchored to a time, not to a vague
    // "before bed" — and a morning anchor, because the wake time sets the clock
    // that the bedtime follows.
    const windDownAt = toClock(toMinutes(targetBed) - 45)
    if (sleep.quality === 'poor') {
      make(1, `Runterkommen ab ${windDownAt}`,
        `Du bewertest deinen Schlaf als schlecht. Eine feste Zeit, ab der der Tag zu Ende ist — ` +
        `${windDownAt}, 45 Minuten vor dem Licht aus.`,
        ['profile.sleep.quality', 'profile.sleep.usualBedtime'],
        { kind: 'wind_down_anchor', windDownAt })
    }

    make(2, `Morgens Licht holen, direkt nach ${currentWake}`,
      `Der stärkste Hebel für die Nacht liegt am Morgen: Tageslicht kurz nach dem Aufstehen ` +
      `stellt die innere Uhr. Bei dir also ab ${currentWake}.`,
      ['profile.sleep.usualWakeTime'],
      { kind: 'morning_light', at: currentWake })

    const weekendStrategy =
      input.schedule.workPattern === 'shift' || input.schedule.workPattern === 'irregular'
        ? 'anchor_wake'
        : 'same_all_days'
    if (weekendStrategy === 'anchor_wake') {
      make(5, 'Am Wochenende höchstens eine Stunde länger',
        'Dein Rhythmus ist ohnehin unregelmäßig. Die Aufstehzeit am Wochenende nah an der ' +
        'Woche zu halten ist der einzige Anker, der bei Schichtarbeit noch funktioniert.',
        ['schedule.workPattern'],
        { kind: 'weekend' })
    }

    if (sleep.wakesAtNight === true) {
      make(3, 'Notiz führen: wann wachst du auf?',
        'Du wachst nachts auf. Eine Woche lang notieren, wann und wobei — daraus wird eine Hypothese, ' +
        'die man testen kann. Bleibt es dabei, gehört das ärztlich abgeklärt.',
        ['profile.sleep.wakesAtNight'],
        { kind: 'observation' })
    }

    return {
      archetype: 'sleep_recovery',
      headline: `${targetBed} bis ${currentWake} · ${targetHours.toFixed(1)} h`,
      summary: [
        `Schlafenszeit ${targetBed}, aufstehen ${currentWake}`,
        `Fenster ${targetHours.toFixed(1)} Stunden`,
        shiftMin > 0 ? `Diese Woche ${shiftMin} Min früher` : 'Zeiten bleiben stabil',
      ],
      items,
      signature: {
        bedtimeBucket: targetBed,
        wakeBucket: currentWake,
        windowBucket: String(Math.round(targetHours)),
        shiftBucket: String(shiftMin),
        windDown: sleep.screenBeforeBed !== false ? 'yes' : 'no',
        windDownAnchor: sleep.quality === 'poor' ? windDownAt : 'none',
        weekendStrategy,
        quality: sleep.quality ?? 'unknown',
        observation: sleep.wakesAtNight === true ? 'yes' : 'no',
      },
    }
  },

  assertInvariants(plan: PlanResult, input: PlanInput): void {
    const sig = plan.strategy.goalTrack.signature
    const shiftMin = Number(sig.shiftBucket)
    const planned = plan.strategy.goalTrack.items[0]?.details.targetHours as number | undefined

    // Seven hours is the destination, not a weekly requirement. Someone
    // sleeping five hours cannot be moved there in one week, and demanding it
    // would contradict the thirty-minute shift cap. What the invariant enforces
    // is the direction of travel, never the arrival.
    const current = input.profile.sleep

    if (current.usualBedtime && current.usualWakeTime && planned !== undefined) {
      const currentHours = sleepWindowHours(current.usualBedtime, current.usualWakeTime)

      // The core rule of this archetype: never less sleep than the user gets today.
      if (planned + 0.01 < currentHours) {
        throw new PlanInvariantError(
          `sleep_recovery: plan would shorten sleep from ${currentHours.toFixed(1)} h to ${planned.toFixed(1)} h`,
        )
      }

      // Below the minimum, standing still is not acceptable either.
      if (currentHours < MIN_SLEEP_HOURS && shiftMin <= 0) {
        throw new PlanInvariantError(
          `sleep_recovery: window of ${currentHours.toFixed(1)} h is below ${MIN_SLEEP_HOURS} h ` +
            `but the plan does not move it`,
        )
      }
    }

    // A long window is only the app's problem if the app created it. Someone who
    // already sleeps ten hours keeps sleeping ten hours — refusing to plan for
    // them because they sleep a lot would be absurd, and shortening it is
    // forbidden by the rule above.
    if (planned !== undefined && planned > MAX_SLEEP_HOURS + 1) {
      const currentHours =
        current.usualBedtime && current.usualWakeTime
          ? sleepWindowHours(current.usualBedtime, current.usualWakeTime)
          : 0
      if (planned > currentHours + 0.01) {
        throw new PlanInvariantError(
          `sleep_recovery: plan would extend sleep to ${planned.toFixed(1)} h, beyond ${MAX_SLEEP_HOURS} h`,
        )
      }
    }

    if (shiftMin > MAX_BEDTIME_SHIFT_MIN_PER_WEEK) {
      throw new PlanInvariantError(
        `sleep_recovery: bedtime shift of ${shiftMin} min exceeds ${MAX_BEDTIME_SHIFT_MIN_PER_WEEK} min per week`,
      )
    }
  },
}
