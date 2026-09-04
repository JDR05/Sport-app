// A population, generated from a seed.
//
// The suite has ten fixture profiles. That is enough to prove the engine
// personalises *between those ten*; it says nothing about the population an app
// actually meets. A safety limit that holds for ten profiles and breaks for one
// shape in a thousand is exactly the bug that ships — and the profiles that
// break it are never the ones somebody thought to write by hand: the
// 92-year-old, the 43 kg body weight, the week with no free slot at all, the
// person who excluded every day they have.
//
// Seeded on purpose: a failure has to be reproducible from its seed, or it is
// an anecdote rather than a finding.
//
// Separate from the runner so a single seed can be inspected without running
// the whole simulation to get at it.
//
// (was: Ten thousand people, one engine.)
//
// The suite has ten fixture profiles and two gates over them. That is enough to
// prove the engine personalises *between those ten*; it is not enough to say
// anything about the population an app actually meets. A safety limit that
// holds for ten profiles and breaks for one shape in a thousand is exactly the
// bug that ships — and the profiles that break it are never the ones somebody
// thought to write by hand: the 92-year-old, the 43 kg body weight, the week
// with no free slot at all, the person who excluded every day they have.
//
// So this generates a population from a seeded pseudo-random source, runs the
// real `generatePlan` over it, and asserts the things that must hold for
// everybody. Seeded on purpose: a failure has to be reproducible from its seed,
// or it is an anecdote rather than a finding.
//
// Deliberately not a vitest file. It takes minutes rather than seconds and is a
// question asked of the engine, not a regression to run on every commit — the
// findings it produces become tests, which is the point.
//
import { addDays } from '../src/lib/engine/dates'
import type {
  Activity, Constraint, Commitment, Equipment, Experience, FreeSlot, Goal, GoalArchetype,
  GoalMetric, PlanInput, Profile, Schedule, Weekday,
} from '../src/lib/domain/types'

// ------------------------------------------------------------------ random --

/**
 * A seeded generator, so every finding can be reproduced from its seed.
 *
 * mulberry32: small, fast, and good enough for generating people. Nothing here
 * is cryptographic and nothing depends on the distribution being perfect —
 * what matters is that run 4711 is the same population every time.
 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = ReturnType<typeof rng>

const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const maybe = <T,>(r: Rand, value: T, chance = 0.5): T | null => (r() < chance ? value : null)
const some = <T,>(r: Rand, xs: readonly T[], max: number): T[] => {
  const out = new Set<T>()
  for (let i = 0; i < int(r, 0, max); i++) out.add(pick(r, xs))
  return [...out]
}

// ----------------------------------------------------------------- people ---

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const ACTIVITIES: Activity[] = [
  'running', 'cycling', 'swimming', 'gym', 'bodyweight', 'yoga', 'football',
  'climbing', 'walking',
]
const EQUIPMENT: Equipment[] = ['none', 'home_basics', 'home_gym', 'gym_membership']
const EXPERIENCE: Experience[] = ['beginner', 'intermediate', 'advanced']

export const ARCHETYPES: GoalArchetype[] = [
  'body_composition', 'strength', 'endurance', 'sleep_recovery',
  'nutrition_quality', 'habit_routine', 'general_health',
]

/** A goal per archetype, in the words somebody would actually type. */
const GOAL_TEXT: Record<GoalArchetype, string[]> = {
  body_composition: ['5 kg abnehmen', 'endlich meinen Bauch loswerden', '8 kg zunehmen'],
  strength: ['100 kg Bankdrücken', 'stärker werden', 'einen Klimmzug schaffen'],
  endurance: ['10 km unter 50 Minuten laufen', 'einen Halbmarathon schaffen'],
  sleep_recovery: ['endlich durchschlafen', 'morgens nicht mehr wie erschlagen aufwachen'],
  nutrition_quality: ['gesünder essen', 'weniger Zucker'],
  habit_routine: ['jeden Tag meditieren', 'weniger prokrastinieren', 'mehr lesen'],
  general_health: ['insgesamt gesünder werden', 'mich einfach besser fühlen'],
}

function person(r: Rand): Profile {
  return {
    // The extremes matter more than the middle. A 16-year-old and a 92-year-old
    // are both people this app can meet, and the calorie floor has to hold for
    // both — as does a null, which is what somebody who skipped the field is.
    birthYear: maybe(r, int(r, 1932, 2010), 0.9),
    heightCm: maybe(r, int(r, 140, 210), 0.9),
    weightKg: maybe(r, int(r, 40, 190), 0.9),
    sexAtBirth: pick(r, ['male', 'female', 'unspecified', null] as const),
    sport: {
      preferredActivities: some(r, ACTIVITIES, 3),
      dislikedActivities: some(r, ACTIVITIES, 2),
      sessionsPerWeekTarget: maybe(r, int(r, 1, 7), 0.7),
      preferredSessionMinutes: maybe(r, int(r, 10, 150), 0.7),
      equipment: some(r, EQUIPMENT, 3),
      experience: maybe(r, pick(r, EXPERIENCE), 0.85),
    },
    nutrition: {
      cooksAtHome: pick(r, ['never', 'sometimes', 'often', null] as const),
      timeForCookingMin: maybe(r, int(r, 0, 120), 0.8),
      eatsOutPerWeek: maybe(r, int(r, 0, 14), 0.8),
      dietaryPattern: pick(r, ['omnivore', 'vegetarian', 'vegan', null] as const),
      mealsPerDay: maybe(r, int(r, 1, 6), 0.8),
      vegetablePortionsPerDay: maybe(r, int(r, 0, 8), 0.8),
      sugaryDrinksPerDay: maybe(r, int(r, 0, 8), 0.8),
    },
    sleep: {
      usualBedtime: maybe(r, `${String(int(r, 19, 23)).padStart(2, '0')}:${pick(r, ['00', '30'])}`, 0.8),
      usualWakeTime: maybe(r, `${String(int(r, 4, 11)).padStart(2, '0')}:${pick(r, ['00', '30'])}`, 0.8),
      quality: pick(r, ['poor', 'ok', 'good', null] as const),
      wakesAtNight: maybe(r, r() < 0.5, 0.8),
      screenBeforeBed: maybe(r, r() < 0.5, 0.8),
    },
    mind: {
      screenTimeHoursPerDay: maybe(r, int(r, 0, 16), 0.7),
      focusStruggle: pick(r, ['low', 'medium', 'high', null] as const),
      existingRoutines: some(r, ['Kaffee am Morgen', 'Abendspaziergang', 'Sonntags kochen'], 2),
    },
  }
}

function week(r: Rand): Schedule {
  // Zero free slots is a real week, and it is the one that used to produce a
  // plan built on days the person never offered.
  const slotCount = int(r, 0, 7)
  const freeSlots: FreeSlot[] = []
  for (let i = 0; i < slotCount; i++) {
    freeSlots.push({
      weekday: pick(r, WEEKDAYS),
      start: `${String(int(r, 5, 21)).padStart(2, '0')}:${pick(r, ['00', '15', '30', '45'])}`,
      minutes: int(r, 10, 180),
    })
  }

  const commitments: Commitment[] = []
  for (let i = 0; i < int(r, 0, 5); i++) {
    commitments.push({
      label: pick(r, ['Fußball', 'Schicht', 'Vorlesung', 'Kinder', 'Chor', 'Handball']),
      weekday: pick(r, WEEKDAYS),
      start: `${String(int(r, 6, 21)).padStart(2, '0')}:00`,
      minutes: int(r, 30, 600),
      kind: pick(r, ['sport', 'work', 'study', 'care', 'other'] as const),
      activity: maybe(r, pick(r, ACTIVITIES), 0.5),
    })
  }

  const wakeTimes: Partial<Record<Weekday, string>> = {}
  for (const day of WEEKDAYS) {
    if (r() < 0.6) wakeTimes[day] = `${String(int(r, 4, 11)).padStart(2, '0')}:00`
  }

  return {
    workPattern: pick(r, ['student', 'office', 'remote', 'shift', 'irregular', null] as const),
    freeSlots,
    commitments,
    wakeTimes,
  }
}

function limits(r: Rand): Constraint[] {
  const out: Constraint[] = []
  // Excluding every weekday is the pathological case and somebody will do it.
  if (r() < 0.3) {
    out.push({
      kind: 'time',
      hard: true,
      value: { type: 'no_training_on', weekdays: some(r, WEEKDAYS, 7) },
    })
  }
  if (r() < 0.25) {
    out.push({ kind: 'time', hard: true, value: { type: 'max_session_minutes', minutes: int(r, 5, 120) } })
  }
  if (r() < 0.3) {
    out.push({ kind: 'dislike', hard: r() < 0.5, value: { type: 'no_activity', activity: pick(r, ACTIVITIES) } })
  }
  if (r() < 0.2) {
    out.push({
      kind: 'dietary',
      hard: true,
      value: { type: 'dietary', pattern: pick(r, ['vegan', 'vegetarian'] as const) },
    })
  }
  return out
}

function goalFor(r: Rand, archetype: GoalArchetype): { goal: Goal; metrics: GoalMetric[] } {
  const goal: Goal = {
    rawText: pick(r, GOAL_TEXT[archetype]),
    archetype,
    // Including dates that are far too close — the clamp is what has to react.
    targetDate: maybe(r, addDays(TODAY, int(r, 7, 400)), 0.7),
    classifiedBy: pick(r, ['ai', 'keywords', 'user'] as const),
  }

  const metrics: GoalMetric[] = []
  if (archetype === 'body_composition' && r() < 0.9) {
    const start = int(r, 45, 180)
    metrics.push({
      metricKey: 'weight_kg',
      startValue: start,
      targetValue: start + (r() < 0.75 ? -int(r, 1, 40) : int(r, 1, 20)),
      currentValue: maybe(r, start - int(r, 0, 8), 0.5),
      unit: 'kg',
    })
  }
  if (archetype === 'endurance' && r() < 0.8) {
    metrics.push({
      metricKey: 'distance_km',
      startValue: int(r, 0, 15),
      targetValue: int(r, 5, 42),
      currentValue: null,
      unit: 'km',
    })
  }
  if (archetype === 'strength' && r() < 0.8) {
    metrics.push({
      metricKey: 'bench_kg',
      startValue: int(r, 20, 100),
      targetValue: int(r, 40, 160),
      currentValue: null,
      unit: 'kg',
    })
  }
  return { goal, metrics }
}

export const TODAY = '2026-08-17'

export function makePerson(seed: number, archetype: GoalArchetype, today: string): PlanInput {
  const r = rng(seed)
  const { goal, metrics } = goalFor(r, archetype)
  return {
    today,
    profile: person(r),
    goal,
    metrics,
    constraints: limits(r),
    schedule: week(r),
    personalRules: [],
  }
}

