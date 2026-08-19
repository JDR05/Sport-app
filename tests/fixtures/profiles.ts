// Ten deliberately different profiles.
//
// Three of them are the personas the playbook names for end-to-end QA; the rest
// widen the space so the personalisation gate is a real test rather than a
// formality. If two of these ever produce nearly the same plan, that is a
// finding about the engine, not about the fixtures.

import type {
  Constraint,
  FreeSlot,
  GoalMetric,
  NutritionProfile,
  PlanInput,
  Profile,
  Schedule,
  SportProfile,
  Weekday,
} from '@/lib/domain/types'

export const TODAY = '2026-08-19'

function slots(spec: Array<[Weekday, string, number]>): FreeSlot[] {
  return spec.map(([weekday, start, minutes]) => ({ weekday, start, minutes }))
}

function sport(over: Partial<SportProfile> = {}): SportProfile {
  return {
    preferredActivities: [],
    dislikedActivities: [],
    sessionsPerWeekTarget: null,
    preferredSessionMinutes: null,
    equipment: ['none'],
    experience: 'beginner',
    ...over,
  }
}

function nutrition(over: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    cooksAtHome: 'sometimes',
    timeForCookingMin: 30,
    eatsOutPerWeek: 2,
    dietaryPattern: 'omnivore',
    mealsPerDay: 3,
    ...over,
  }
}

function schedule(over: Partial<Schedule> = {}): Schedule {
  return {
    wakeTime: '07:00',
    sleepTime: '23:00',
    workPattern: null,
    freeSlots: [],
    weekendDiffers: false,
    ...over,
  }
}

function weightGoal(startValue: number, targetValue: number): GoalMetric[] {
  return [{ metricKey: 'weight_kg', startValue, targetValue, unit: 'kg' }]
}

function input(args: {
  profile: Profile
  schedule: Schedule
  metrics: GoalMetric[]
  targetDate: string | null
  constraints?: Constraint[]
}): PlanInput {
  return {
    today: TODAY,
    profile: args.profile,
    goal: { title: '5 kg abnehmen', targetDate: args.targetDate },
    metrics: args.metrics,
    constraints: args.constraints ?? [],
    schedule: args.schedule,
    personalRules: [],
  }
}

/** Persona A from the playbook: student, little time, three sessions, −5 kg. */
export const lenaStudent = input({
  profile: {
    birthYear: 2003,
    heightCm: 168,
    sexAtBirth: 'female',
    lifeSituation: 'student',
    sport: sport({
      preferredActivities: ['gym'],
      sessionsPerWeekTarget: 3,
      preferredSessionMinutes: 45,
      equipment: ['gym_membership'],
      experience: 'intermediate',
    }),
    nutrition: nutrition({ cooksAtHome: 'sometimes', timeForCookingMin: 25, mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: 'student',
    freeSlots: slots([
      ['tue', '19:30', 75], ['thu', '19:30', 75], ['sat', '10:00', 120], ['sun', '11:00', 90],
    ]),
  }),
  metrics: weightGoal(72, 67),
  targetDate: '2026-11-11',
})

/** Persona B from the playbook: irregular shift work, two sessions. */
export const marcoShift = input({
  profile: {
    birthYear: 1991,
    heightCm: 182,
    sexAtBirth: 'male',
    lifeSituation: 'shift_work',
    sport: sport({
      preferredActivities: ['bodyweight'],
      sessionsPerWeekTarget: 2,
      preferredSessionMinutes: 30,
      equipment: ['home_basics'],
      experience: 'beginner',
    }),
    nutrition: nutrition({ cooksAtHome: 'never', eatsOutPerWeek: 5, mealsPerDay: 2 }),
  },
  schedule: schedule({
    workPattern: 'shift',
    freeSlots: slots([['mon', '06:30', 45], ['fri', '06:30', 45], ['sun', '15:00', 60]]),
    weekendDiffers: true,
  }),
  metrics: weightGoal(94, 89),
  targetDate: '2026-12-15',
})

/** Persona C from the playbook: little motivation, irregular sleep, routines first. */
export const sofieRoutines = input({
  profile: {
    birthYear: 1996,
    heightCm: 165,
    sexAtBirth: 'female',
    lifeSituation: 'unemployed',
    sport: sport({
      preferredActivities: ['walking'],
      sessionsPerWeekTarget: 1,
      preferredSessionMinutes: 25,
      equipment: ['none'],
      experience: 'beginner',
    }),
    nutrition: nutrition({ cooksAtHome: 'never', timeForCookingMin: 10, eatsOutPerWeek: 1, mealsPerDay: 2 }),
  },
  schedule: schedule({
    workPattern: 'irregular',
    freeSlots: slots([['wed', '14:00', 40], ['sat', '13:00', 60]]),
  }),
  metrics: weightGoal(78, 73),
  targetDate: null,
})

/** Office job, advanced, trains a lot, cooks a lot. */
export const jonasAmbitious = input({
  profile: {
    birthYear: 1994,
    heightCm: 186,
    sexAtBirth: 'male',
    lifeSituation: 'employed',
    sport: sport({
      preferredActivities: ['gym'],
      sessionsPerWeekTarget: 5,
      preferredSessionMinutes: 70,
      equipment: ['gym_membership'],
      experience: 'advanced',
    }),
    nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 60, eatsOutPerWeek: 1, mealsPerDay: 4 }),
  },
  schedule: schedule({
    workPattern: 'office',
    freeSlots: slots([
      ['mon', '18:00', 90], ['tue', '18:00', 90], ['wed', '18:00', 90],
      ['thu', '18:00', 90], ['fri', '18:00', 90], ['sun', '09:00', 120],
    ]),
  }),
  metrics: weightGoal(88, 83),
  targetDate: '2026-11-25',
})

/** Runs, vegan, no gym, works from home. */
export const aylinRunner = input({
  profile: {
    birthYear: 1998,
    heightCm: 172,
    sexAtBirth: 'female',
    lifeSituation: 'employed',
    sport: sport({
      preferredActivities: ['running', 'yoga'],
      dislikedActivities: ['gym'],
      sessionsPerWeekTarget: 4,
      preferredSessionMinutes: 50,
      equipment: ['none'],
      experience: 'intermediate',
    }),
    nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 50, dietaryPattern: 'vegan', mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: 'remote',
    freeSlots: slots([
      ['mon', '07:00', 60], ['wed', '07:00', 60], ['fri', '07:00', 60], ['sat', '09:00', 90],
    ]),
  }),
  metrics: weightGoal(69, 64),
  targetDate: '2026-12-01',
})

/** Plays football on fixed club evenings, so those days are blocked. */
export const tobiasFootball = input({
  profile: {
    birthYear: 1999,
    heightCm: 179,
    sexAtBirth: 'male',
    lifeSituation: 'employed',
    sport: sport({
      preferredActivities: ['football', 'gym'],
      sessionsPerWeekTarget: 3,
      preferredSessionMinutes: 60,
      equipment: ['gym_membership'],
      experience: 'advanced',
    }),
    nutrition: nutrition({ cooksAtHome: 'sometimes', timeForCookingMin: 35, eatsOutPerWeek: 3, mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: 'office',
    freeSlots: slots([
      ['mon', '17:30', 90], ['wed', '17:30', 90], ['fri', '17:30', 90], ['sat', '11:00', 120],
    ]),
  }),
  metrics: weightGoal(84, 79),
  targetDate: '2026-11-18',
  constraints: [
    {
      kind: 'time',
      hard: true,
      value: { type: 'no_training_on', weekdays: ['tue', 'thu'] },
    },
  ],
})

/** Travels constantly, eats out often, trains with body weight only. */
export const ninaTravel = input({
  profile: {
    birthYear: 1989,
    heightCm: 170,
    sexAtBirth: 'female',
    lifeSituation: 'self_employed',
    sport: sport({
      preferredActivities: ['bodyweight'],
      sessionsPerWeekTarget: 2,
      preferredSessionMinutes: 35,
      equipment: ['none'],
      experience: 'intermediate',
    }),
    nutrition: nutrition({ cooksAtHome: 'never', timeForCookingMin: 0, eatsOutPerWeek: 6, mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: 'irregular',
    freeSlots: slots([['tue', '21:00', 40], ['thu', '21:00', 40], ['sun', '17:00', 60]]),
  }),
  metrics: weightGoal(75, 70),
  targetDate: '2027-01-20',
})

/** Older, heavier, beginner, plenty of time. Tests the low-intensity end. */
export const peterBeginner = input({
  profile: {
    birthYear: 1968,
    heightCm: 176,
    sexAtBirth: 'male',
    lifeSituation: 'unemployed',
    sport: sport({
      preferredActivities: ['walking', 'cycling'],
      dislikedActivities: ['running'],
      sessionsPerWeekTarget: 3,
      preferredSessionMinutes: 40,
      equipment: ['none'],
      experience: 'beginner',
    }),
    nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 60, eatsOutPerWeek: 0, mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: null,
    freeSlots: slots([
      ['mon', '10:00', 90], ['tue', '10:00', 90], ['wed', '10:00', 90],
      ['thu', '10:00', 90], ['fri', '10:00', 90], ['sat', '10:00', 90], ['sun', '10:00', 90],
    ]),
  }),
  metrics: weightGoal(105, 100),
  targetDate: '2026-12-30',
})

/** Vegetarian, swims and does yoga, only has time around midday. */
export const miraMidday = input({
  profile: {
    birthYear: 1992,
    heightCm: 163,
    sexAtBirth: 'female',
    lifeSituation: 'employed',
    sport: sport({
      preferredActivities: ['swimming', 'yoga'],
      sessionsPerWeekTarget: 3,
      preferredSessionMinutes: 45,
      equipment: ['none'],
      experience: 'intermediate',
    }),
    nutrition: nutrition({ cooksAtHome: 'often', timeForCookingMin: 45, dietaryPattern: 'vegetarian', mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: 'remote',
    freeSlots: slots([['mon', '12:00', 60], ['wed', '12:00', 60], ['fri', '12:00', 60]]),
  }),
  metrics: weightGoal(66, 61),
  targetDate: '2026-12-08',
})

/** Wants five kilos in six weeks. The rate cap has to move the date. */
export const erikImpatient = input({
  profile: {
    birthYear: 1985,
    heightCm: 181,
    sexAtBirth: 'male',
    lifeSituation: 'self_employed',
    sport: sport({
      preferredActivities: ['gym', 'running'],
      sessionsPerWeekTarget: 4,
      preferredSessionMinutes: 30,
      equipment: ['home_gym'],
      experience: 'intermediate',
    }),
    nutrition: nutrition({ cooksAtHome: 'sometimes', timeForCookingMin: 20, eatsOutPerWeek: 3, mealsPerDay: 3 }),
  },
  schedule: schedule({
    workPattern: 'irregular',
    freeSlots: slots([['mon', '20:30', 35], ['wed', '20:30', 35], ['sat', '08:00', 45]]),
  }),
  metrics: weightGoal(91, 86),
  targetDate: '2026-09-30',
})

export const ALL_PROFILES = [
  { name: 'Lena (Studentin)', input: lenaStudent },
  { name: 'Marco (Schichtdienst)', input: marcoShift },
  { name: 'Sofie (Routinen)', input: sofieRoutines },
  { name: 'Jonas (ambitioniert)', input: jonasAmbitious },
  { name: 'Aylin (Läuferin, vegan)', input: aylinRunner },
  { name: 'Tobias (Fußball)', input: tobiasFootball },
  { name: 'Nina (viel unterwegs)', input: ninaTravel },
  { name: 'Peter (Einsteiger, 58)', input: peterBeginner },
  { name: 'Mira (Mittagspause)', input: miraMidday },
  { name: 'Erik (ungeduldig)', input: erikImpatient },
] as const

/** Onboarding abandoned after the bare minimum. Must still yield a valid plan. */
export const incompleteProfile: PlanInput = input({
  profile: {
    birthYear: null,
    heightCm: null,
    sexAtBirth: null,
    lifeSituation: null,
    sport: sport({ experience: null }),
    nutrition: nutrition({
      cooksAtHome: null,
      timeForCookingMin: null,
      eatsOutPerWeek: null,
      dietaryPattern: null,
      mealsPerDay: null,
    }),
  },
  schedule: schedule({ workPattern: null, freeSlots: slots([['tue', '18:00', 45], ['sat', '10:00', 60]]) }),
  metrics: weightGoal(80, 75),
  targetDate: null,
})
