// Losing or gaining weight.
//
// The only archetype where calories are part of the plan, and therefore the
// only one that carries calorie floors. Everything here was the whole engine
// before the course correction; now it is one of seven.

import {
  STRENGTH_ACTIVITIES,
  KCAL_PER_KG,
  MAX_DEFICIT_SHARE,
  MAX_WEEKLY_CHANGE_KG,
  MAX_WEEKLY_CHANGE_SHARE,
  MILD_DEFICIT_THRESHOLD,
  DEFAULT_HORIZON_WEEKS,
  DEFAULT_SESSIONS_PER_WEEK,
  DEFAULT_SESSION_MINUTES,
  MIN_VIABLE_SESSION_MINUTES,
  FALLBACK,
} from '../constants'
import { sportSessionsPerWeek } from '../commitments'
import { addDays, daysBetween, formatGermanDate } from '../dates'
import { computeEnergy, intakeFloor, targetIntake } from '../energy'
import { PlanInvariantError } from '../errors'
import { horizonFor, withNote } from '../horizon'
import { currentOf } from '../progress'
import {
  bestSlotOn,
  dateOf,
  excludedActivities,
  formatDecimal,
  longestSlotOn,
  planTrainingDays,
  restDays,
  round1,
  slotOf,
  type PlanContext,
} from '../context'
import type { ArchetypeStrategy, ClampedGoal } from './types'
import type {
  Activity,
  GoalTrack,
  PlanInput,
  PlannedItem,
  PlanResult,
  Weekday,
} from '@/lib/domain/types'

const SPORT_ACTIVITIES: Activity[] = ['running', 'cycling', 'swimming', 'football', 'climbing']

const ACTIVITY_LABEL: Record<Activity, string> = {
  gym: 'Krafttraining im Gym',
  bodyweight: 'Krafttraining ohne Geräte',
  running: 'Laufen',
  cycling: 'Radfahren',
  swimming: 'Schwimmen',
  football: 'Fußball',
  climbing: 'Klettern',
  walking: 'Spaziergang',
  yoga: 'Yoga',
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

const SESSION_FOCUS = {
  beginner: 'Ganzkörper, Grundübungen',
  intermediate: 'Ganzkörper mit Steigerung',
  advanced: 'Split nach Muskelgruppen',
} as const

export function maxWeeklyChangeKg(startWeightKg: number): number {
  return Math.min(MAX_WEEKLY_CHANGE_SHARE * startWeightKg, MAX_WEEKLY_CHANGE_KG)
}

function weightMetric(input: PlanInput) {
  return input.metrics.find((m) => m.metricKey === 'weight_kg')
}

export const bodyComposition: ArchetypeStrategy = {
  archetype: 'body_composition',
  label: 'Körper und Gewicht',

  clampGoal(ctx: PlanContext): ClampedGoal {
    const { input } = ctx
    const metric = weightMetric(input)
    const start = currentOf(metric) ?? input.profile.weightKg ?? FALLBACK.weightKg
    const target = metric?.targetValue ?? start

    const totalChangeKg = Math.abs(start - target)
    const maxRate = maxWeeklyChangeKg(start)

    const weeksRequested = input.goal.targetDate
      ? daysBetween(input.today, input.goal.targetDate) / 7
      : DEFAULT_HORIZON_WEEKS
    const safeWeeks = totalChangeKg > 0 ? Math.ceil(totalChangeKg / maxRate) : 0

    if (totalChangeKg === 0) {
      // No change to pace, so the rate check below never runs — which is where
      // a date in the past used to slip through untouched.
      const open = horizonFor(input.today, input.goal.targetDate, DEFAULT_HORIZON_WEEKS)
      return {
        adjusted: open.adjusted,
        targetDate: input.goal.targetDate === null ? null : open.targetDate,
        reason: withNote(open.note, 'Kein Zielwert gesetzt.'),
      }
    }

    if (weeksRequested <= 0 || weeksRequested < safeWeeks) {
      const safeDate = addDays(input.today, safeWeeks * 7)
      const rate = totalChangeKg / safeWeeks
      return {
        adjusted: true,
        targetDate: safeDate,
        reason:
          `${formatDecimal(totalChangeKg)} kg bis zum ${formatGermanDate(safeDate)} — ` +
          `das sind ${formatDecimal(rate)} kg pro Woche. Schneller wäre nicht gesünder, ` +
          `und dieses Tempo hältst du auch durch.`,
      }
    }

    const { targetDate, adjusted, note } = horizonFor(
      input.today, input.goal.targetDate, Math.ceil(weeksRequested),
    )
    const rate = totalChangeKg / weeksRequested
    return {
      adjusted,
      targetDate,
      reason: withNote(
        note,
        `${formatDecimal(totalChangeKg)} kg bis zum ${formatGermanDate(targetDate)} — ` +
          `das sind ${formatDecimal(rate)} kg pro Woche und liegt im sicheren Bereich.`,
      ),
    }
  },

  planGoalTrack(ctx: PlanContext): GoalTrack {
    const { input, experience } = ctx
    const metric = weightMetric(input)
    const start = currentOf(metric) ?? input.profile.weightKg ?? FALLBACK.weightKg
    const target = metric?.targetValue ?? start
    const losing = target <= start

    const clamped = this.clampGoal(ctx)
    const weeks = clamped.targetDate
      ? Math.max(1, daysBetween(input.today, clamped.targetDate) / 7)
      : DEFAULT_HORIZON_WEEKS
    // Full precision, deliberately unrounded.
    //
    // This number drives the daily calorie deficit, and round1() moved it by
    // up to ±50 kcal a day against what the person actually asked for — 5 kg
    // in 9 weeks is 0.5556 kg/week, which rounds up to 0.6 and plans a deficit
    // 49 kcal larger than requested. Sometimes it rounded the other way and
    // planned a slower loss than the person had agreed to.
    //
    // Neither drift was ever unsafe: targetIntake() caps the deficit at
    // MAX_DEFICIT_SHARE, and the invariant below recomputes the rate from the
    // raw values rather than from this one. But a safety-relevant calculation
    // must not be driven by a rounding that exists for display. Rounding
    // happens where the number is shown, not where it is used.
    const ratePerWeekKg = Math.abs(start - target) / weeks

    // ------------------------------------------------------- training ----
    const desired = input.profile.sport.sessionsPerWeekTarget ?? DEFAULT_SESSIONS_PER_WEEK[experience]
    // At least one session of the plan's own kind, even for someone who
    // already trains three times at a club: football is training, but a deficit
    // without resistance work costs muscle, and that is the one thing losing
    // weight must not do.
    // The sessions this archetype plans are resistance work, so only resistance
    // work replaces them. Football helps the energy balance — and the rest-day
    // budget counts it — but it does not keep muscle in a deficit, which is
    // the one thing losing weight must not lose.
    const { weekdays, planned: sessions, total: trainingDaysThisWeek } =
      planTrainingDays(ctx, desired, 1, undefined, STRENGTH_ACTIVITIES)

    const modality = pickModality(input)
    const sessionMinutes = pickSessionMinutes(ctx, weekdays)

    // --------------------------------------------------------- energy ----
    const energy = computeEnergy({
      profile: input.profile,
      schedule: input.schedule,
      today: input.today,
      // The week's real training load, not just the part this app planned.
      // Someone playing football twice a week burns that energy whether or not
      // the plan put it there, and eating for a lighter week than they actually
      // have is the wrong direction to be wrong in.
      sessionsPerWeek: trainingDaysThisWeek,
    })
    ctx.assumptions.push(...energy.assumptions)

    const desiredDelta = (ratePerWeekKg * KCAL_PER_KG) / 7
    const intake = targetIntake({
      dailyNeedKcal: energy.dailyNeedKcal,
      desiredDeficitKcal: losing ? desiredDelta : 0,
      floorKcal: energy.intakeFloorKcal,
    })
    // Gaining weight means a surplus, which needs no floor — only a capped rate.
    const targetIntakeKcal = losing
      ? intake.targetIntakeKcal
      : Math.round(energy.dailyNeedKcal + desiredDelta)
    const deltaKcal = losing ? intake.deficitKcal : Math.round(desiredDelta)

    ctx.rationale.push({
      text: clamped.reason,
      basedOn: ['goal.targetDate', 'metrics.weight_kg'],
    })
    if (losing && intake.cappedBy === 'floor') {
      ctx.rationale.push({
        text:
          `Dein Tagesziel liegt bei ${targetIntakeKcal} kcal. Tiefer geht die App nicht — ` +
          `das ist eine feste Untergrenze, unabhängig vom Zieldatum.`,
        basedOn: ['profile.sexAtBirth'],
      })
    }

    const rateShare = ratePerWeekKg / maxWeeklyChangeKg(start)
    const items = [
      ...trainingItems(ctx, weekdays, modality, sessionMinutes),
      ...nutritionItems(ctx, targetIntakeKcal, deltaKcal, losing),
    ]

    return {
      archetype: 'body_composition',
      headline: `${targetIntakeKcal} kcal · ${sessions}× Training`,
      summary: [
        `${sessions}× Training à ${sessionMinutes} Min`,
        `${targetIntakeKcal} kcal pro Tag (${losing ? '−' : '+'}${deltaKcal})`,
        `${restDays(weekdays).length} Ruhetage`,
      ],
      items,
      signature: {
        sessionsBucket: bucketSessions(sessions),
        weekdayPattern: weekdays.join('-') || 'none',
        modality,
        sessionLength: bucketMinutes(sessionMinutes),
        intakeBucket: String(Math.floor(targetIntakeKcal / 250) * 250),
        direction: losing ? 'deficit' : 'surplus',
        intensity: rateShare < MILD_DEFICIT_THRESHOLD ? 'mild' : 'moderate',
      },
    }
  },

  assertInvariants(plan: PlanResult, input: PlanInput): void {
    const track = plan.strategy.goalTrack
    const intake = Number(track.signature.intakeBucket)
    const floor = intakeFloor(input.profile)
    const metric = weightMetric(input)
    const start = currentOf(metric) ?? input.profile.weightKg ?? FALLBACK.weightKg

    if (track.signature.direction === 'deficit' && intake + 249 < floor) {
      throw new PlanInvariantError(
        `body_composition: intake bucket ${intake} sits below the floor of ${floor} kcal`,
      )
    }

    // The same number the plan ate for, which is the week's *real* training
    // load — the sessions this app planned plus the ones the person already
    // has. Reading only the planned half made the check disagree with the plan
    // it was checking: a week with three football evenings and no room left
    // for a gym session came out as "zero training", the daily need dropped
    // with it, and a deficit the plan had computed correctly was refused as
    // too large. The person got "Plan nicht möglich" for training a lot.
    const energy = computeEnergy({
      profile: input.profile,
      schedule: input.schedule,
      today: input.today,
      sessionsPerWeek: sportSessionsPerWeek(input.schedule.commitments)
        + Number(track.summary[0]?.match(/^(\d+)/)?.[1] ?? 0),
    })
    const deficit = Number(track.summary[1]?.match(/−(\d+)/)?.[1] ?? 0)
    if (deficit > energy.dailyNeedKcal * MAX_DEFICIT_SHARE + 1) {
      throw new PlanInvariantError(
        `body_composition: deficit ${deficit} kcal exceeds ${MAX_DEFICIT_SHARE * 100}% of the daily need`,
      )
    }

    const target = metric?.targetValue ?? start
    const weeks = plan.strategy.targetDate
      ? Math.max(1, daysBetween(input.today, plan.strategy.targetDate) / 7)
      : DEFAULT_HORIZON_WEEKS
    const rate = Math.abs(start - target) / weeks
    if (rate > maxWeeklyChangeKg(start) + 0.05) {
      throw new PlanInvariantError(
        `body_composition: rate ${round1(rate)} kg/week exceeds the cap of ${round1(maxWeeklyChangeKg(start))}`,
      )
    }
  },
}

// ------------------------------------------------------------ helpers ----

export function pickModality(input: PlanInput) {
  const excluded = excludedActivities(input)
  const preferred = input.profile.sport.preferredActivities.filter((a) => !excluded.includes(a))
  const equipment = input.profile.sport.equipment

  // Wanting the gym is not the same as being able to go: without a membership
  // or a home gym, prescribing gym sessions is a plan the user cannot follow.
  const hasGym =
    !excluded.includes('gym') &&
    (equipment.includes('gym_membership') || equipment.includes('home_gym'))
  const hasSport = preferred.some((a) => SPORT_ACTIVITIES.includes(a))

  if (hasGym && hasSport) return 'mixed'
  if (hasGym) return 'gym'
  if (hasSport) return 'sport'
  return 'bodyweight'
}

export function pickSessionMinutes(ctx: PlanContext, weekdays: Weekday[]): number {
  const { input, experience } = ctx
  let minutes =
    input.profile.sport.preferredSessionMinutes ?? DEFAULT_SESSION_MINUTES[experience]

  if (ctx.sessionMinutesCap !== null) minutes = Math.min(minutes, ctx.sessionMinutesCap)

  const shortest = weekdays.reduce(
    (min, day) => Math.min(min, longestSlotOn(input, day)),
    Number.POSITIVE_INFINITY,
  )
  if (Number.isFinite(shortest)) minutes = Math.min(minutes, shortest)

  return Math.max(MIN_VIABLE_SESSION_MINUTES, Math.round(minutes))
}

export function trainingItems(
  ctx: PlanContext,
  weekdays: Weekday[],
  modality: string,
  sessionMinutes: number,
): PlannedItem[] {
  const { input } = ctx
  const excluded = excludedActivities(input)
  const preferred = input.profile.sport.preferredActivities.filter((a) => !excluded.includes(a))
  const sport = preferred.find((a) => SPORT_ACTIVITIES.includes(a))

  return weekdays.map((day, index) => {
    const activity: Activity =
      modality === 'gym' ? 'gym'
      : modality === 'sport' ? (sport ?? 'walking')
      : modality === 'mixed' ? (index % 2 === 0 ? 'gym' : (sport ?? 'gym'))
      : 'bodyweight'

    const slot = bestSlotOn(input, day, ctx.rules.preferredSlot)
    const parts = [slot ? `${WEEKDAY_LABEL[day]} ${slot.start}` : WEEKDAY_LABEL[day], `${sessionMinutes} Min`]
    const reasons = [`schedule.freeSlots.${day}`, 'profile.sport.equipment']

    if (modality === 'gym' || modality === 'bodyweight') {
      parts.push(SESSION_FOCUS[ctx.experience])
      reasons.push('profile.sport.experience')
    }
    if (input.profile.sport.dislikedActivities.length > 0) {
      parts.push(
        `${input.profile.sport.dislikedActivities.map((a) => ACTIVITY_LABEL[a]).join(' und ')} hast du ausgeschlossen`,
      )
      reasons.push('profile.sport.dislikedActivities')
    }
    if (input.profile.sport.preferredSessionMinutes !== null) {
      reasons.push('profile.sport.preferredSessionMinutes')
    }

    return {
      scheduledOn: dateOf(ctx, day),
      domain: 'training' as const,
      track: 'goal' as const,
      title: ACTIVITY_LABEL[activity],
      plannedDurationMin: sessionMinutes,
      timeSlot: slotOf(input, day, ctx.rules.preferredSlot),
      rationale: { text: parts.join(', '), basedOn: reasons },
      details: { modality, activity, focus: SESSION_FOCUS[ctx.experience], availableMinutes: longestSlotOn(input, day) },
    }
  })
}

function nutritionItems(
  ctx: PlanContext,
  kcal: number,
  deltaKcal: number,
  losing: boolean,
): PlannedItem[] {
  const n = ctx.input.profile.nutrition
  const meals = n.mealsPerDay ?? 3
  const cooks = n.cooksAtHome ?? 'sometimes'
  const eatsOut = n.eatsOutPerWeek ?? 2
  const cookingTime = n.timeForCookingMin ?? 30

  const approach =
    eatsOut >= 4 ? 'eating_out_aware'
    : cooks === 'often' && cookingTime >= 45 ? 'meal_prep'
    : cooks === 'never' ? 'simple_swaps'
    : 'structured'

  /**
   * `every` marks a standing rule rather than an appointment.
   *
   * The distinction matters more than it looks. A calorie corridor and protein
   * at every meal are true on all seven days; planning them on one weekday made
   * the plan read as nonsense — "Eiweiß zu jeder Hauptmahlzeit, mittwochs" —
   * and reduced the entire nutrition side of the goal to one tick a week, which
   * is what the adaptive engine was then drawing conclusions from. Meal prep
   * and the weekly shop really are appointments, and stay on their day.
   */
  const make = (
    day: Weekday,
    title: string,
    text: string,
    basedOn: string[],
    every: boolean = false,
  ): PlannedItem => ({
    scheduledOn: dateOf(ctx, day),
    domain: 'nutrition',
    track: 'goal',
    title,
    plannedDurationMin: null,
    timeSlot: null,
    rationale: { text, basedOn },
    cadence: every ? 'daily' : 'weekly',
    details: { approach, targetIntakeKcal: kcal },
  })

  const direction = losing ? 'Defizit' : 'Überschuss'

  switch (approach) {
    case 'meal_prep':
      return [
        make('sun', 'Meal-Prep für die Woche',
          `Du kochst oft und hast ${cookingTime} Min Zeit dafür — einmal vorkochen spart dir die Entscheidung an vier Abenden.`,
          ['profile.nutrition.cooksAtHome', 'profile.nutrition.timeForCookingMin']),
        make('wed', 'Nachkochen für die zweite Wochenhälfte',
          'Zweiter Kochblock, damit die vorbereiteten Portionen bis Sonntag reichen.',
          ['profile.nutrition.cooksAtHome']),
        make('mon', `${meals} Mahlzeiten, Ziel ${kcal} kcal`,
          `${meals} Mahlzeiten am Tag, wie von dir angegeben, verteilt auf rund ${kcal} kcal.`,
          ['profile.nutrition.mealsPerDay'], true),
      ]
    case 'structured':
      return [
        make('mon', `${meals} feste Mahlzeiten, Ziel ${kcal} kcal`,
          `${meals} Mahlzeiten am Tag bei rund ${kcal} kcal — feste Zeiten, damit du abends nicht nachholen musst.`,
          ['profile.nutrition.mealsPerDay'], true),
        make('mon', 'Eiweiß zu jeder Hauptmahlzeit',
          `Bei ${deltaKcal} kcal ${direction} hält Eiweiß dich satt und schützt die Muskulatur.`,
          ['profile.nutrition.cooksAtHome'], true),
        make('sat', 'Einkauf für die kommende Woche',
          `Du kochst ${cooks === 'often' ? 'oft' : 'gelegentlich'} und hast dafür ${cookingTime} Min — ein geplanter Einkauf macht genau das einfacher.`,
          ['profile.nutrition.cooksAtHome', 'profile.nutrition.timeForCookingMin']),
      ]
    case 'simple_swaps':
      return [
        make('mon', 'Zwei feste Tauschgriffe',
          'Du kochst nicht — statt Rezepten also zwei feste Tauschgriffe bei dem, was du ohnehin kaufst.',
          ['profile.nutrition.cooksAtHome'], true),
        make('mon', 'Getränke auf kalorienfrei umstellen',
          `Der einfachste Hebel ohne Kochen: Getränke. Zielkorridor bleibt ${kcal} kcal.`,
          ['profile.nutrition.cooksAtHome'], true),
      ]
    case 'eating_out_aware':
    default:
      return [
        make('mon', `Auswärts bewusst wählen (${eatsOut}× diese Woche)`,
          `Du isst ${eatsOut}× pro Woche auswärts — der Plan arbeitet damit, statt es zu verbieten.`,
          ['profile.nutrition.eatsOutPerWeek']),
        make('mon', `Zu Hause einfach halten, Ziel ${kcal} kcal`,
          'An den Tagen zu Hause bleibt es simpel, damit die Auswärts-Tage nicht kompensiert werden müssen.',
          ['profile.nutrition.eatsOutPerWeek'], true),
        make('sat', 'Vorher entscheiden, nicht vor Ort',
          'Die Wahl vorab zu treffen ist wirksamer als am Tisch zu widerstehen.',
          ['profile.nutrition.eatsOutPerWeek']),
      ]
  }
}

export function bucketSessions(n: number): string {
  if (n === 0) return '0'
  if (n <= 2) return '1-2'
  if (n <= 4) return '3-4'
  return '5+'
}

export function bucketMinutes(m: number): string {
  if (m <= 30) return '<=30'
  if (m <= 50) return '31-50'
  return '>50'
}
