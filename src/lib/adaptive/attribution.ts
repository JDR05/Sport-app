// Why a pattern is there, when the circumstances can say so.
//
// Detection finds that Tuesdays go badly. On its own that is a fact with an
// implied cause, and the implied cause is always the person — which is exactly
// the reading the brief rules out. This module looks for a circumstance that
// differs on those days and names it.
//
// The product owner's example is the whole specification: football until nine,
// up at five, and the app should say "that adds up" rather than treat it as a
// discipline problem. So an attribution never grades a day and never suggests
// the person try harder. It states what was different, with the numbers.
//
// Deliberately not a cause-finder. Correlation over a handful of days is not
// causation, and the language is chosen to claim only what the data supports:
// "an diesen Tagen ist X anders", never "X ist der Grund". The app offers the
// connection; the person is the one who knows whether it is true.
//
// Pure: dates, numbers and weekly commitments in, sentences out.

import { LATE_END_MINUTES, MIN_CONTEXT_DAYS, SCALE_GAP, SLEEP_GAP_HOURS } from './constants'
import type { Deviation } from './types'
import { weekdayOf } from '@/lib/engine/dates'
import { minutesOfDay } from '@/lib/engine/commitments'
import type { Commitment, Weekday } from '@/lib/domain/types'

/** One day as the person described it. Every field is optional by design. */
export type DayContext = {
  date: string
  /** 1..5, higher is better. */
  energy: number | null
  /** 1..5, higher is better. */
  mood: number | null
  /** 1..5, higher is *more* stress — one of the two scales that read upwards. */
  stress: number | null
  sleepHours: number | null
  /** 1..5, higher is better. */
  dietQuality: number | null
  /** 1..5, higher is *more* soreness. The other upward scale. */
  soreness: number | null
}

export type AttributionFactor =
  | 'short_sleep'
  | 'low_energy'
  | 'high_stress'
  | 'high_soreness'
  | 'poor_diet'
  | 'late_commitment'

export type Attribution = {
  factor: AttributionFactor
  /** The deviation bucket this concerns, e.g. 'tue'. */
  bucket: string
  /** Average on the affected days, and on the rest. Both null for a commitment. */
  onBucket: number | null
  elsewhere: number | null
  statement: string
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montags', tue: 'Dienstags', wed: 'Mittwochs', thu: 'Donnerstags',
  fri: 'Freitags', sat: 'Samstags', sun: 'Sonntags',
}

/**
 * What was different about the days this deviation covers.
 *
 * Only weekday deviations are attributed. A time-of-day or duration pattern is
 * about the plan's shape, and a check-in cannot speak to it — a low-energy
 * evening says nothing about why evenings differ from mornings, because the
 * check-in belongs to the day, not to the hour.
 */
export function attribute(
  deviation: Deviation,
  days: DayContext[],
  commitments: Commitment[],
): Attribution[] {
  if (deviation.dimension !== 'weekday') return []
  const weekday = deviation.bucket as Weekday
  if (!(weekday in WEEKDAY_LABEL)) return []

  const found: Attribution[] = []

  const late = latestCommitmentOn(commitments, weekday)
  if (late) {
    found.push({
      factor: 'late_commitment',
      bucket: weekday,
      onBucket: null,
      elsewhere: null,
      statement:
        `${WEEKDAY_LABEL[weekday]} hast du ${late.label} bis ${endTimeOf(late)}. ` +
        `Was danach noch im Plan steht, konkurriert mit Heimweg, Essen und Schlaf.`,
    })
  }

  const onDay = days.filter((d) => weekdayOf(d.date) === weekday)
  const otherDays = days.filter((d) => weekdayOf(d.date) !== weekday)

  const sleep = compare(onDay, otherDays, (d) => d.sleepHours)
  if (sleep && sleep.elsewhere - sleep.onBucket >= SLEEP_GAP_HOURS) {
    found.push({
      factor: 'short_sleep',
      bucket: weekday,
      ...sleep,
      statement:
        `${WEEKDAY_LABEL[weekday]} schläfst du im Schnitt ${hours(sleep.onBucket)} statt ` +
        `${hours(sleep.elsewhere)}. Das ist der deutlichste Unterschied an diesen Tagen.`,
    })
  }

  const energy = compare(onDay, otherDays, (d) => d.energy)
  if (energy && energy.elsewhere - energy.onBucket >= SCALE_GAP) {
    found.push({
      factor: 'low_energy',
      bucket: weekday,
      ...energy,
      statement:
        `${WEEKDAY_LABEL[weekday]} gibst du deine Energie mit ${scale(energy.onBucket)} an, ` +
        `sonst mit ${scale(energy.elsewhere)}.`,
    })
  }

  // Reversed: stress counts upwards, so the affected days are the higher ones.
  const stress = compare(onDay, otherDays, (d) => d.stress)
  if (stress && stress.onBucket - stress.elsewhere >= SCALE_GAP) {
    found.push({
      factor: 'high_stress',
      bucket: weekday,
      ...stress,
      statement:
        `${WEEKDAY_LABEL[weekday]} liegt dein Stress bei ${scale(stress.onBucket)}, ` +
        `sonst bei ${scale(stress.elsewhere)}.`,
    })
  }

  const soreness = compare(onDay, otherDays, (d) => d.soreness)
  if (soreness && soreness.onBucket - soreness.elsewhere >= SCALE_GAP) {
    found.push({
      factor: 'high_soreness',
      bucket: weekday,
      ...soreness,
      statement:
        `${WEEKDAY_LABEL[weekday]} ist dein Muskelkater bei ${scale(soreness.onBucket)}, ` +
        `sonst bei ${scale(soreness.elsewhere)}. Der Körper trägt an diesen Tagen mehr.`,
    })
  }

  const diet = compare(onDay, otherDays, (d) => d.dietQuality)
  if (diet && diet.elsewhere - diet.onBucket >= SCALE_GAP) {
    found.push({
      factor: 'poor_diet',
      bucket: weekday,
      ...diet,
      statement:
        `${WEEKDAY_LABEL[weekday]} bewertest du dein Essen mit ${scale(diet.onBucket)}, ` +
        `sonst mit ${scale(diet.elsewhere)}.`,
    })
  }

  return found
}

/**
 * The two averages, or null when either side is too thin to compare.
 *
 * A missing value is skipped rather than counted as zero — the same rule that
 * governs an unrated action. Someone who logs sleep twice a week has two data
 * points, not five bad nights.
 */
function compare(
  onDay: DayContext[],
  otherDays: DayContext[],
  pick: (d: DayContext) => number | null,
): { onBucket: number; elsewhere: number } | null {
  const a = onDay.map(pick).filter((v): v is number => v !== null)
  const b = otherDays.map(pick).filter((v): v is number => v !== null)
  if (a.length < MIN_CONTEXT_DAYS || b.length < MIN_CONTEXT_DAYS) return null
  return { onBucket: mean(a), elsewhere: mean(b) }
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** The commitment that runs latest on a weekday, if any of them runs late. */
function latestCommitmentOn(commitments: Commitment[], weekday: Weekday): Commitment | null {
  const late = commitments
    .filter((c) => c.weekday === weekday)
    .filter((c) => minutesOfDay(c.start) + c.minutes >= LATE_END_MINUTES)
  if (late.length === 0) return null
  return late.reduce((latest, c) =>
    minutesOfDay(c.start) + c.minutes > minutesOfDay(latest.start) + latest.minutes ? c : latest,
  )
}

function endTimeOf(c: Commitment): string {
  const end = minutesOfDay(c.start) + c.minutes
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

function hours(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} h`
}

function scale(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} von 5`
}
