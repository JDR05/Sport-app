// Turns a week strategy into concrete, dated actions.
//
// Every item carries a rationale that names the user's own input. A plan the
// user cannot trace back to something they said reads as generic advice, no
// matter how personalised it actually was. See critique K1.

import { addDays, timeSlotOf } from './dates'
import { longestSlotOn } from './strategy'
import { FALLBACK } from './constants'
import {
  WEEKDAYS,
  type Activity,
  type CookingFrequency,
  type Experience,
  type PlanInput,
  type PlannedItem,
  type TimeSlot,
  type Weekday,
  type WeekStrategy,
} from '@/lib/domain/types'

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
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}

const SPORT_ACTIVITIES: Activity[] = ['running', 'cycling', 'swimming', 'football', 'climbing']

/** A beginner and an advanced athlete must not receive the same session. */
const SESSION_FOCUS: Record<Experience, string> = {
  beginner: 'Ganzkörper, Grundübungen',
  intermediate: 'Ganzkörper mit Steigerung',
  advanced: 'Split nach Muskelgruppen',
}

const COOKING_LABEL: Record<CookingFrequency, string> = {
  never: 'kochst nicht',
  sometimes: 'kochst gelegentlich',
  often: 'kochst oft',
}

export function buildItems(input: PlanInput, strategy: WeekStrategy): PlannedItem[] {
  return [
    ...trainingItems(input, strategy),
    ...nutritionItems(input, strategy),
    ...movementItems(input, strategy),
  ]
}

function dateOf(strategy: WeekStrategy, day: Weekday): string {
  return addDays(strategy.weekStart, WEEKDAYS.indexOf(day))
}

function slotOn(input: PlanInput, day: Weekday): { start: string; slot: TimeSlot } | null {
  const slots = input.schedule.freeSlots
    .filter((s) => s.weekday === day)
    .sort((a, b) => b.minutes - a.minutes)
  const best = slots[0]
  return best ? { start: best.start, slot: timeSlotOf(best.start) } : null
}

function trainingItems(input: PlanInput, strategy: WeekStrategy): PlannedItem[] {
  const excluded = new Set(input.profile.sport.dislikedActivities)
  const preferred = input.profile.sport.preferredActivities.filter((a) => !excluded.has(a))
  const sport = preferred.find((a) => SPORT_ACTIVITIES.includes(a))

  return strategy.trainingWeekdays.map((day, index) => {
    const activity = pickActivity(strategy, sport, index)
    const slot = slotOn(input, day)
    const reasons: string[] = [`schedule.freeSlots.${day}`]
    const parts: string[] = []

    if (slot) parts.push(`${WEEKDAY_LABEL[day]} ${slot.start}`)
    else parts.push(WEEKDAY_LABEL[day])

    parts.push(`${strategy.sessionMinutes} Min`)

    const experience = input.profile.sport.experience ?? FALLBACK.experience
    if (strategy.trainingModality === 'gym' || strategy.trainingModality === 'bodyweight') {
      parts.push(SESSION_FOCUS[experience])
      reasons.push('profile.sport.experience')
    }

    // The equipment drove the choice of modality, so it is cited as a reason.
    // It is not repeated in the text: for bodyweight the title already says
    // "ohne Geräte", and for swimming it would be noise.
    if (input.profile.sport.equipment.length > 0) {
      reasons.push('profile.sport.equipment')
    }

    if (input.profile.sport.dislikedActivities.length > 0) {
      const disliked = input.profile.sport.dislikedActivities
        .map((a) => ACTIVITY_LABEL[a])
        .join(' und ')
      parts.push(`${disliked} hast du ausgeschlossen`)
      reasons.push('profile.sport.dislikedActivities')
    }

    if (input.profile.sport.preferredSessionMinutes !== null) {
      reasons.push('profile.sport.preferredSessionMinutes')
    }

    return {
      scheduledOn: dateOf(strategy, day),
      domain: 'training',
      title: ACTIVITY_LABEL[activity],
      plannedDurationMin: strategy.sessionMinutes,
      timeSlot: slot?.slot ?? null,
      rationale: { text: parts.join(', '), basedOn: reasons },
      details: {
        modality: strategy.trainingModality,
        activity,
        focus: SESSION_FOCUS[input.profile.sport.experience ?? FALLBACK.experience],
        availableMinutes: longestSlotOn(input, day),
      },
    }
  })
}

function pickActivity(
  strategy: WeekStrategy,
  sport: Activity | undefined,
  index: number,
): Activity {
  switch (strategy.trainingModality) {
    case 'gym':
      return 'gym'
    case 'sport':
      return sport ?? 'walking'
    case 'mixed':
      // Alternate so a mixed preference actually shows up as a mix.
      return index % 2 === 0 ? 'gym' : (sport ?? 'gym')
    case 'bodyweight':
      return 'bodyweight'
  }
}

function nutritionItems(input: PlanInput, strategy: WeekStrategy): PlannedItem[] {
  const n = input.profile.nutrition
  const kcal = strategy.targetIntakeKcal
  const meals = n.mealsPerDay ?? 3
  const items: PlannedItem[] = []

  const push = (day: Weekday, title: string, text: string, basedOn: string[]) => {
    items.push({
      scheduledOn: dateOf(strategy, day),
      domain: 'nutrition',
      title,
      plannedDurationMin: null,
      timeSlot: null,
      rationale: { text, basedOn },
      details: { approach: strategy.nutritionApproach, targetIntakeKcal: kcal },
    })
  }

  switch (strategy.nutritionApproach) {
    case 'meal_prep':
      push('sun', 'Meal-Prep für die Woche',
        `Du kochst oft und hast ${n.timeForCookingMin} Min Zeit dafür — einmal vorkochen spart dir die Entscheidung an vier Abenden.`,
        ['profile.nutrition.cooksAtHome', 'profile.nutrition.timeForCookingMin'])
      push('wed', 'Nachkochen für die zweite Wochenhälfte',
        `Zweiter Kochblock, damit die vorbereiteten Portionen bis Sonntag reichen.`,
        ['profile.nutrition.cooksAtHome'])
      push('mon', `${meals} Mahlzeiten, Ziel ${kcal} kcal`,
        `${meals} Mahlzeiten am Tag, wie von dir angegeben, verteilt auf rund ${kcal} kcal.`,
        ['profile.nutrition.mealsPerDay'])
      break

    case 'structured': {
      // The approach is the same for everyone here, so the wording carries the
      // personalisation: same structure, visibly different plan.
      const cooks = COOKING_LABEL[n.cooksAtHome ?? 'sometimes']
      push('mon', `${meals} feste Mahlzeiten, Ziel ${kcal} kcal`,
        `${meals} Mahlzeiten am Tag bei rund ${kcal} kcal — feste Zeiten, damit du abends nicht nachholen musst.`,
        ['profile.nutrition.mealsPerDay'])
      push('wed', 'Eiweiß zu jeder Hauptmahlzeit',
        `Bei ${strategy.deficitKcal} kcal Defizit hält Eiweiß dich satt und schützt die Muskulatur.`,
        ['profile.nutrition.cooksAtHome'])
      push('sat', 'Einkauf für die kommende Woche',
        `Du ${cooks} und hast dafür ${n.timeForCookingMin ?? 30} Min — ein geplanter Einkauf macht genau das einfacher.`,
        ['profile.nutrition.cooksAtHome', 'profile.nutrition.timeForCookingMin'])
      break
    }

    case 'simple_swaps':
      push('mon', 'Zwei feste Tauschgriffe',
        `Du kochst nicht — statt Rezepten also zwei feste Tauschgriffe bei dem, was du ohnehin kaufst.`,
        ['profile.nutrition.cooksAtHome'])
      push('thu', `Getränke auf kalorienfrei umstellen`,
        `Der einfachste Hebel ohne Kochen: Getränke. Zielkorridor bleibt ${kcal} kcal.`,
        ['profile.nutrition.cooksAtHome'])
      break

    case 'eating_out_aware':
      push('mon', `Auswärts bewusst wählen (${n.eatsOutPerWeek}× diese Woche)`,
        `Du isst ${n.eatsOutPerWeek}× pro Woche auswärts — der Plan arbeitet damit, statt es zu verbieten.`,
        ['profile.nutrition.eatsOutPerWeek'])
      push('wed', `Zu Hause einfach halten, Ziel ${kcal} kcal`,
        `An den Tagen zu Hause bleibt es simpel, damit die Auswärts-Tage nicht kompensiert werden müssen.`,
        ['profile.nutrition.eatsOutPerWeek'])
      push('sat', 'Vorher entscheiden, nicht vor Ort',
        `Die Wahl vorab zu treffen ist wirksamer als am Tisch zu widerstehen.`,
        ['profile.nutrition.eatsOutPerWeek'])
      break
  }

  if (input.profile.nutrition.dietaryPattern === 'vegan' || input.profile.nutrition.dietaryPattern === 'vegetarian') {
    const label = input.profile.nutrition.dietaryPattern === 'vegan' ? 'vegane' : 'vegetarische'
    push('tue', `Eiweißquellen ${label} abdecken`,
      `Deine ${label} Ernährung braucht bei einem Defizit bewusst gewählte Eiweißquellen.`,
      ['profile.nutrition.dietaryPattern'])
  }

  return items
}

function movementItems(input: PlanInput, strategy: WeekStrategy): PlannedItem[] {
  const days: Weekday[] = strategy.movementApproach === 'commute'
    ? ['mon', 'tue', 'wed', 'thu', 'fri']
    : strategy.movementApproach === 'walk_blocks'
      ? ['mon', 'wed', 'fri']
      : [...WEEKDAYS]

  const title =
    strategy.movementApproach === 'commute'
      ? 'Weg zur Uni zu Fuß oder mit dem Rad'
      : strategy.movementApproach === 'walk_blocks'
        ? '2× 15 Min Gehpause'
        : `${strategy.dailyStepTarget} Schritte`

  const text =
    strategy.movementApproach === 'commute'
      ? 'Dein Studienalltag hat feste Wege — die zählen als Bewegung, ohne dass du extra Zeit brauchst.'
      : strategy.movementApproach === 'walk_blocks'
        ? 'Du arbeitest überwiegend sitzend. Zwei kurze Blöcke sind leichter unterzubringen als ein langer Spaziergang.'
        : `Ohne festen Tagesrhythmus ist ein Schrittziel der robusteste Anker — ${strategy.dailyStepTarget} Schritte passen zu ${strategy.trainingSessions} ${strategy.trainingSessions === 1 ? 'Trainingseinheit' : 'Trainingseinheiten'}.`

  return days.map((day) => ({
    scheduledOn: dateOf(strategy, day),
    domain: 'movement' as const,
    title,
    plannedDurationMin: strategy.movementApproach === 'walk_blocks' ? 30 : null,
    timeSlot: null,
    rationale: { text, basedOn: ['schedule.workPattern'] },
    details: { approach: strategy.movementApproach, stepTarget: strategy.dailyStepTarget },
  }))
}
