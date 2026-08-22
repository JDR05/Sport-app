// The intake, as the form holds it — and the way back from what was stored.
//
// The form used to start empty every time. That is right for a first goal and
// destructive for a second: "Ziel wechseln" opened a blank intake, and
// submitting it replaced free slots, commitments, wake times, hard constraints
// and every profile answer with whatever the blank draft still contained.
// Someone who changed their goal and used "Rest überspringen" lost the football
// training the night rule depends on, the days they had blocked, and their
// equipment — silently, because the write succeeded.
//
// It also contradicted the screen that leads there, which says in so many
// words: "Die Angaben sind gespeichert. Du musst hier nichts noch einmal
// machen."
//
// So the mapping runs in both directions and lives here, out of the component,
// where it can be tested without a browser. `toDraft` is the inverse of the
// form's own payload builder; a round trip has to come back unchanged, and a
// test holds it to that.

import { WEEKDAYS } from '@/lib/domain/types'
import type {
  Activity, Commitment, CookingFrequency, DietaryPattern, Equipment, Experience,
  FocusStruggle, GoalArchetype, SexAtBirth, SleepQuality, Weekday, WorkPattern,
} from '@/lib/domain/types'
import type { StoredPlanInput } from '@/lib/db/plan-input'

export const SLOT_START = { early: '07:00', midday: '12:00', evening: '18:30' } as const
export type SlotTime = keyof typeof SLOT_START

export type Draft = {
  goalText: string
  archetype: GoalArchetype | null
  targetDate: string | null
  metricStart: number | null
  metricTarget: number | null

  birthYear: number | null
  heightCm: number | null
  weightKg: number | null
  sexAtBirth: SexAtBirth | null

  workPattern: WorkPattern | null
  freeDays: Weekday[]
  slotTime: SlotTime | null
  slotMinutes: number | null

  preferredActivities: Activity[]
  equipment: Equipment[]
  experience: Experience | null
  sessionsPerWeekTarget: number | null
  preferredSessionMinutes: number | null

  cooksAtHome: CookingFrequency | null
  timeForCookingMin: number | null
  eatsOutPerWeek: number | null
  dietaryPattern: DietaryPattern | null
  mealsPerDay: number | null
  vegetablePortionsPerDay: number | null
  sugaryDrinksPerDay: number | null

  usualBedtime: string | null
  usualWakeTime: string | null
  sleepQuality: SleepQuality | null
  wakesAtNight: boolean | null
  screenBeforeBed: boolean | null

  screenTimeHoursPerDay: number | null
  focusStruggle: FocusStruggle | null
  existingRoutines: string

  commitments: Commitment[]
  /** 'HH:MM' per weekday, partial: a day nobody answered stays unknown. */
  wakeTimes: Partial<Record<Weekday, string>>

  dislikedActivities: Activity[]
  blockedDays: Weekday[]
}

export const EMPTY: Draft = {
  goalText: '', archetype: null, targetDate: null, metricStart: null, metricTarget: null,
  birthYear: null, heightCm: null, weightKg: null, sexAtBirth: null,
  workPattern: null, freeDays: [], slotTime: null, slotMinutes: null,
  preferredActivities: [], equipment: [], experience: null,
  sessionsPerWeekTarget: null, preferredSessionMinutes: null,
  cooksAtHome: null, timeForCookingMin: null, eatsOutPerWeek: null,
  dietaryPattern: null, mealsPerDay: null, vegetablePortionsPerDay: null, sugaryDrinksPerDay: null,
  usualBedtime: null, usualWakeTime: null, sleepQuality: null, wakesAtNight: null, screenBeforeBed: null,
  screenTimeHoursPerDay: null, focusStruggle: null, existingRoutines: '',
  commitments: [],
  wakeTimes: {},
  dislikedActivities: [], blockedDays: [],
}

/**
 * What the person already told us, back in the shape the form edits.
 *
 * The goal itself is deliberately *not* carried over. Someone who asked to
 * redefine their goal is here to write a new one, and pre-filling the old text
 * would invite them to submit it again by accident — which would retire a goal
 * and replace it with a copy of itself. Everything that describes their life
 * rather than their goal is restored.
 */
export function toDraft(stored: StoredPlanInput): Draft {
  const { profile, schedule } = stored

  return {
    ...EMPTY,

    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    sexAtBirth: profile.sexAtBirth,

    workPattern: schedule.workPattern,
    freeDays: freeDaysOf(schedule.freeSlots),
    slotTime: slotTimeOf(schedule.freeSlots),
    slotMinutes: schedule.freeSlots[0]?.minutes ?? null,

    preferredActivities: profile.sport.preferredActivities,
    // 'none' is what the payload writes when nobody picked anything, so it is
    // an absence rather than an answer and must not come back as a selection.
    equipment: profile.sport.equipment.filter((e) => e !== 'none'),
    experience: profile.sport.experience,
    sessionsPerWeekTarget: profile.sport.sessionsPerWeekTarget,
    preferredSessionMinutes: profile.sport.preferredSessionMinutes,

    cooksAtHome: profile.nutrition.cooksAtHome,
    timeForCookingMin: profile.nutrition.timeForCookingMin,
    eatsOutPerWeek: profile.nutrition.eatsOutPerWeek,
    dietaryPattern: profile.nutrition.dietaryPattern,
    mealsPerDay: profile.nutrition.mealsPerDay,
    vegetablePortionsPerDay: profile.nutrition.vegetablePortionsPerDay,
    sugaryDrinksPerDay: profile.nutrition.sugaryDrinksPerDay,

    usualBedtime: profile.sleep.usualBedtime,
    usualWakeTime: profile.sleep.usualWakeTime,
    sleepQuality: profile.sleep.quality,
    wakesAtNight: profile.sleep.wakesAtNight,
    screenBeforeBed: profile.sleep.screenBeforeBed,

    screenTimeHoursPerDay: profile.mind.screenTimeHoursPerDay,
    focusStruggle: profile.mind.focusStruggle,
    existingRoutines: profile.mind.existingRoutines.join(', '),

    commitments: schedule.commitments,
    wakeTimes: schedule.wakeTimes,

    dislikedActivities: profile.sport.dislikedActivities,
    blockedDays: blockedDaysOf(stored),
  }
}

/** The weekdays that carry a free slot, in week order rather than row order. */
function freeDaysOf(slots: StoredPlanInput['schedule']['freeSlots']): Weekday[] {
  const days = new Set(slots.map((s) => s.weekday))
  return WEEKDAYS.filter((day) => days.has(day))
}

/**
 * Which band the stored slots belong to.
 *
 * The form offers one band for the whole week, so the stored start times are
 * all the same by construction — but a row written by an older version, or by
 * hand, might not be. Reading the first one back is honest: it is the answer
 * the form is able to represent, and anything else would silently discard the
 * rest.
 */
function slotTimeOf(slots: StoredPlanInput['schedule']['freeSlots']): SlotTime | null {
  const start = slots[0]?.start
  if (!start) return null
  const match = (Object.keys(SLOT_START) as SlotTime[]).find((key) => SLOT_START[key] === start)
  return match ?? null
}

/** The hard "never train on" days, read back out of the constraints. */
function blockedDaysOf(stored: StoredPlanInput): Weekday[] {
  const blocked = new Set<Weekday>()
  for (const constraint of stored.constraints) {
    if (constraint.value.type !== 'no_training_on') continue
    for (const day of constraint.value.weekdays) blocked.add(day)
  }
  return WEEKDAYS.filter((day) => blocked.has(day))
}
