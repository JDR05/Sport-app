// Fixtures for both gates.
//
// `PROFILES` holds ten deliberately different people. `GOALS` holds one goal per
// archetype. The two are combined differently by each gate: personalisation
// varies the person and holds the goal, goal orientation holds the person and
// varies the goal.

import type {
  Constraint,
  FreeSlot,
  Goal,
  GoalArchetype,
  GoalMetric,
  MindProfile,
  NutritionProfile,
  PlanInput,
  Profile,
  Schedule,
  SleepProfile,
  SportProfile,
  Weekday,
} from '@/lib/domain/types'

export const TODAY = '2026-08-19'

function slots(spec: Array<[Weekday, string, number]>): FreeSlot[] {
  return spec.map(([weekday, start, minutes]) => ({ weekday, start, minutes }))
}

function sport(over: Partial<SportProfile> = {}): SportProfile {
  return {
    preferredActivities: [], dislikedActivities: [], sessionsPerWeekTarget: null,
    preferredSessionMinutes: null, equipment: ['none'], experience: 'beginner', ...over,
  }
}

function nutrition(over: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    cooksAtHome: 'sometimes', timeForCookingMin: 30, eatsOutPerWeek: 2,
    dietaryPattern: 'omnivore', mealsPerDay: 3,
    vegetablePortionsPerDay: 2, sugaryDrinksPerDay: 1, ...over,
  }
}

function sleep(over: Partial<SleepProfile> = {}): SleepProfile {
  return {
    usualBedtime: '23:00', usualWakeTime: '07:00', quality: 'ok',
    wakesAtNight: false, screenBeforeBed: true, ...over,
  }
}

function mind(over: Partial<MindProfile> = {}): MindProfile {
  return { screenTimeHoursPerDay: 3, focusStruggle: 'medium', existingRoutines: [], ...over }
}

function schedule(over: Partial<Schedule> = {}): Schedule {
  return { workPattern: null, freeSlots: [], commitments: [], ...over }
}

export type NamedProfile = {
  name: string
  profile: Profile
  schedule: Schedule
  constraints: Constraint[]
}

/** Ten people. Same goal for all of them in the personalisation gate. */
export const PROFILES: NamedProfile[] = [
  {
    name: 'Lena (Studentin)',
    profile: {
      birthYear: 2003, heightCm: 168, weightKg: 72, sexAtBirth: 'female',
      sport: sport({ preferredActivities: ['gym'], sessionsPerWeekTarget: 3, preferredSessionMinutes: 45, equipment: ['gym_membership'], experience: 'intermediate' }),
      nutrition: nutrition({ timeForCookingMin: 25, vegetablePortionsPerDay: 2 }),
      sleep: sleep({ usualBedtime: '00:30', usualWakeTime: '08:00', quality: 'ok' }),
      mind: mind({ screenTimeHoursPerDay: 5, focusStruggle: 'medium' }),
    },
    schedule: schedule({ workPattern: 'student', freeSlots: slots([['tue', '19:30', 75], ['thu', '19:30', 75], ['sat', '10:00', 120], ['sun', '11:00', 90]]) }),
    constraints: [],
  },
  {
    name: 'Marco (Schichtdienst)',
    profile: {
      birthYear: 1991, heightCm: 182, weightKg: 94, sexAtBirth: 'male',
      sport: sport({ preferredActivities: ['bodyweight'], sessionsPerWeekTarget: 2, preferredSessionMinutes: 30, equipment: ['home_basics'] }),
      nutrition: nutrition({ cooksAtHome: 'never', eatsOutPerWeek: 5, mealsPerDay: 2, vegetablePortionsPerDay: 1, sugaryDrinksPerDay: 3 }),
      sleep: sleep({ usualBedtime: '01:00', usualWakeTime: '06:00', quality: 'poor', wakesAtNight: true }),
      mind: mind({ screenTimeHoursPerDay: 2, focusStruggle: 'low' }),
    },
    schedule: schedule({ workPattern: 'shift', freeSlots: slots([['mon', '06:30', 45], ['fri', '06:30', 45], ['sun', '15:00', 60]]) }),
    constraints: [],
  },
  {
    name: 'Sofie (wenig Antrieb)',
    profile: {
      birthYear: 1996, heightCm: 165, weightKg: 78, sexAtBirth: 'female',
      sport: sport({ preferredActivities: ['walking'], sessionsPerWeekTarget: 1, preferredSessionMinutes: 25 }),
      nutrition: nutrition({ cooksAtHome: 'never', timeForCookingMin: 10, eatsOutPerWeek: 1, mealsPerDay: 2, vegetablePortionsPerDay: 0, sugaryDrinksPerDay: 2 }),
      sleep: sleep({ usualBedtime: '02:00', usualWakeTime: '10:00', quality: 'poor' }),
      mind: mind({ screenTimeHoursPerDay: 7, focusStruggle: 'high' }),
    },
    schedule: schedule({ workPattern: 'irregular', freeSlots: slots([['wed', '14:00', 40], ['sat', '13:00', 60]]) }),
    constraints: [],
  },
  {
    name: 'Jonas (ambitioniert)',
    profile: {
      birthYear: 1994, heightCm: 186, weightKg: 88, sexAtBirth: 'male',
      sport: sport({ preferredActivities: ['gym'], sessionsPerWeekTarget: 5, preferredSessionMinutes: 70, equipment: ['gym_membership'], experience: 'advanced' }),
      nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 60, eatsOutPerWeek: 1, mealsPerDay: 4, vegetablePortionsPerDay: 4, sugaryDrinksPerDay: 0 }),
      sleep: sleep({ usualBedtime: '22:30', usualWakeTime: '06:30', quality: 'good' }),
      mind: mind({ screenTimeHoursPerDay: 2, focusStruggle: 'low', existingRoutines: ['Kaffee um 6:45'] }),
    },
    schedule: schedule({ workPattern: 'office', freeSlots: slots([['mon', '18:00', 90], ['tue', '18:00', 90], ['wed', '18:00', 90], ['thu', '18:00', 90], ['fri', '18:00', 90], ['sun', '09:00', 120]]) }),
    constraints: [],
  },
  {
    name: 'Aylin (vegan, läuft)',
    profile: {
      birthYear: 1998, heightCm: 172, weightKg: 69, sexAtBirth: 'female',
      sport: sport({ preferredActivities: ['running', 'yoga'], dislikedActivities: ['gym'], sessionsPerWeekTarget: 4, preferredSessionMinutes: 50, experience: 'intermediate' }),
      nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 50, dietaryPattern: 'vegan', vegetablePortionsPerDay: 5, sugaryDrinksPerDay: 0 }),
      sleep: sleep({ usualBedtime: '22:00', usualWakeTime: '06:00', quality: 'good', screenBeforeBed: false }),
      mind: mind({ screenTimeHoursPerDay: 1, focusStruggle: 'low' }),
    },
    schedule: schedule({ workPattern: 'remote', freeSlots: slots([['mon', '07:00', 60], ['wed', '07:00', 60], ['fri', '07:00', 60], ['sat', '09:00', 90]]) }),
    constraints: [],
  },
  {
    name: 'Tobias (Vereinssport)',
    profile: {
      birthYear: 1999, heightCm: 179, weightKg: 84, sexAtBirth: 'male',
      sport: sport({ preferredActivities: ['football', 'gym'], sessionsPerWeekTarget: 3, preferredSessionMinutes: 60, equipment: ['gym_membership'], experience: 'advanced' }),
      nutrition: nutrition({ timeForCookingMin: 35, eatsOutPerWeek: 3, vegetablePortionsPerDay: 3 }),
      sleep: sleep({ usualBedtime: '23:30', usualWakeTime: '07:00' }),
      mind: mind({ screenTimeHoursPerDay: 4 }),
    },
    schedule: schedule({ workPattern: 'office', freeSlots: slots([['mon', '17:30', 90], ['wed', '17:30', 90], ['fri', '17:30', 90], ['sat', '11:00', 120]]) }),
    constraints: [{ kind: 'time', hard: true, value: { type: 'no_training_on', weekdays: ['tue', 'thu'] } }],
  },
  {
    name: 'Nina (viel unterwegs)',
    profile: {
      birthYear: 1989, heightCm: 170, weightKg: 75, sexAtBirth: 'female',
      sport: sport({ preferredActivities: ['bodyweight'], sessionsPerWeekTarget: 2, preferredSessionMinutes: 35, experience: 'intermediate' }),
      nutrition: nutrition({ cooksAtHome: 'never', timeForCookingMin: 0, eatsOutPerWeek: 6, vegetablePortionsPerDay: 1, sugaryDrinksPerDay: 2 }),
      sleep: sleep({ usualBedtime: '23:45', usualWakeTime: '06:15', wakesAtNight: true }),
      mind: mind({ screenTimeHoursPerDay: 6, focusStruggle: 'high' }),
    },
    schedule: schedule({ workPattern: 'irregular', freeSlots: slots([['tue', '21:00', 40], ['thu', '21:00', 40], ['sun', '17:00', 60]]) }),
    constraints: [],
  },
  {
    name: 'Peter (58, Einsteiger)',
    profile: {
      birthYear: 1968, heightCm: 176, weightKg: 105, sexAtBirth: 'male',
      sport: sport({ preferredActivities: ['walking', 'cycling'], dislikedActivities: ['running'], sessionsPerWeekTarget: 3, preferredSessionMinutes: 40 }),
      nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 60, eatsOutPerWeek: 0, vegetablePortionsPerDay: 3, sugaryDrinksPerDay: 1 }),
      sleep: sleep({ usualBedtime: '22:00', usualWakeTime: '05:30' }),
      mind: mind({ screenTimeHoursPerDay: 3, focusStruggle: 'low' }),
    },
    schedule: schedule({ workPattern: null, freeSlots: slots([['mon', '10:00', 90], ['tue', '10:00', 90], ['wed', '10:00', 90], ['thu', '10:00', 90], ['fri', '10:00', 90], ['sat', '10:00', 90], ['sun', '10:00', 90]]) }),
    constraints: [],
  },
  {
    name: 'Mira (Mittagspause)',
    profile: {
      birthYear: 1992, heightCm: 163, weightKg: 66, sexAtBirth: 'female',
      sport: sport({ preferredActivities: ['swimming', 'yoga'], sessionsPerWeekTarget: 3, preferredSessionMinutes: 45, experience: 'intermediate' }),
      nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 45, dietaryPattern: 'vegetarian', vegetablePortionsPerDay: 4 }),
      sleep: sleep({ usualBedtime: '23:15', usualWakeTime: '07:15' }),
      mind: mind({ screenTimeHoursPerDay: 4, existingRoutines: ['Mittagspause 12:00'] }),
    },
    schedule: schedule({ workPattern: 'remote', freeSlots: slots([['mon', '12:00', 60], ['wed', '12:00', 60], ['fri', '12:00', 60]]) }),
    constraints: [],
  },
  {
    name: 'Erik (wenig Zeit)',
    profile: {
      birthYear: 1985, heightCm: 181, weightKg: 91, sexAtBirth: 'male',
      sport: sport({ preferredActivities: ['gym', 'running'], sessionsPerWeekTarget: 4, preferredSessionMinutes: 30, equipment: ['home_gym'], experience: 'intermediate' }),
      nutrition: nutrition({ timeForCookingMin: 20, eatsOutPerWeek: 3, vegetablePortionsPerDay: 2, sugaryDrinksPerDay: 4 }),
      sleep: sleep({ usualBedtime: '00:45', usualWakeTime: '06:30', quality: 'poor', wakesAtNight: true }),
      mind: mind({ screenTimeHoursPerDay: 5, focusStruggle: 'high' }),
    },
    schedule: schedule({ workPattern: 'irregular', freeSlots: slots([['mon', '20:30', 35], ['wed', '20:30', 35], ['sat', '08:00', 45]]) }),
    constraints: [],
  },
]

// ------------------------------------------------------------- goals ------

export type NamedGoal = {
  name: string
  archetype: GoalArchetype
  goal: Goal
  metrics: (p: Profile) => GoalMetric[]
}

/** One goal per archetype, phrased the way a user would type it. */
export const GOALS: NamedGoal[] = [
  {
    name: '5 kg abnehmen',
    archetype: 'body_composition',
    goal: { rawText: 'Ich möchte 5 kg abnehmen', archetype: 'body_composition', targetDate: '2026-11-11', classifiedBy: 'keywords' },
    metrics: (p) => [{ metricKey: 'weight_kg', startValue: p.weightKg, targetValue: (p.weightKg ?? 80) - 5, unit: 'kg' }],
  },
  {
    name: 'stärker werden',
    archetype: 'strength',
    goal: { rawText: 'Ich will stärker werden und Muskeln aufbauen', archetype: 'strength', targetDate: '2026-12-15', classifiedBy: 'keywords' },
    metrics: () => [{ metricKey: 'load_kg', startValue: 40, targetValue: 60, unit: 'kg' }],
  },
  {
    name: '10 km laufen',
    archetype: 'endurance',
    goal: { rawText: 'Ich will 10 km am Stück laufen können', archetype: 'endurance', targetDate: '2026-12-01', classifiedBy: 'keywords' },
    metrics: () => [{ metricKey: 'distance_km', startValue: 12, targetValue: 30, unit: 'km' }],
  },
  {
    name: 'besser schlafen',
    archetype: 'sleep_recovery',
    goal: { rawText: 'Ich will endlich besser schlafen', archetype: 'sleep_recovery', targetDate: null, classifiedBy: 'keywords' },
    metrics: () => [],
  },
  {
    name: 'gesünder essen',
    archetype: 'nutrition_quality',
    goal: { rawText: 'Ich möchte mich gesünder ernähren', archetype: 'nutrition_quality', targetDate: null, classifiedBy: 'keywords' },
    metrics: () => [],
  },
  {
    name: 'weniger Handy',
    archetype: 'habit_routine',
    goal: { rawText: 'Weniger am Handy, dafür jeden Tag lesen', archetype: 'habit_routine', targetDate: null, classifiedBy: 'keywords' },
    metrics: () => [],
  },
  {
    name: 'irgendwie gesünder',
    archetype: 'general_health',
    goal: { rawText: 'Ich will mich einfach besser fühlen', archetype: 'general_health', targetDate: null, classifiedBy: 'keywords' },
    metrics: () => [],
  },
]

export function makeInput(profile: NamedProfile, goal: NamedGoal): PlanInput {
  return {
    today: TODAY,
    profile: profile.profile,
    goal: goal.goal,
    metrics: goal.metrics(profile.profile),
    constraints: profile.constraints,
    schedule: profile.schedule,
    personalRules: [],
  }
}

/** Every profile with every goal — 70 combinations. */
export const ALL_COMBINATIONS = PROFILES.flatMap((p) =>
  GOALS.map((g) => ({ name: `${p.name} · ${g.name}`, input: makeInput(p, g) })),
)

/** Onboarding abandoned after the bare minimum. Must still yield a valid plan. */
export const incompleteInput: PlanInput = {
  today: TODAY,
  profile: {
    birthYear: null, heightCm: null, weightKg: null, sexAtBirth: null,
    sport: sport({ experience: null }),
    nutrition: {
      cooksAtHome: null, timeForCookingMin: null, eatsOutPerWeek: null,
      dietaryPattern: null, mealsPerDay: null,
      vegetablePortionsPerDay: null, sugaryDrinksPerDay: null,
    },
    sleep: { usualBedtime: null, usualWakeTime: null, quality: null, wakesAtNight: null, screenBeforeBed: null },
    mind: { screenTimeHoursPerDay: null, focusStruggle: null, existingRoutines: [] },
  },
  goal: { rawText: 'abnehmen', archetype: 'body_composition', targetDate: null, classifiedBy: 'keywords' },
  metrics: [{ metricKey: 'weight_kg', startValue: 80, targetValue: 75, unit: 'kg' }],
  constraints: [],
  schedule: schedule({ freeSlots: slots([['tue', '18:00', 45], ['sat', '10:00', 60]]) }),
  personalRules: [],
}
