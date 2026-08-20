// Which questions a day is worth asking.
//
// The check-in could ask nine things. Asking nine things every evening is the
// second job the brief rules out, and it is also how the answers stop being
// honest: people who feel interrogated start tapping the middle option.
//
// So the columns exist for everyone and the *questions* follow the goal. A
// sleep goal has no business asking about muscle soreness; a strength goal does
// not need to know about a glass of wine. Every archetype keeps the same three
// core questions, because energy, mood and sleep explain something whatever
// someone is working on, and adds at most three of its own.
//
// The history stays complete either way: changing goals does not delete what
// was already recorded, it only changes what is asked from now on.

import type { GoalArchetype } from '@/lib/domain/types'

export const CHECKIN_FIELDS = [
  'energy',
  'mood',
  'sleepHours',
  'stress',
  'dietQuality',
  'soreness',
  'alcoholUnits',
  'caffeineLate',
] as const

export type CheckInField = (typeof CHECKIN_FIELDS)[number]

/**
 * Asked whatever the goal is.
 *
 * Sleep is in here rather than in the sleep archetype on purpose: it turned out
 * to be the factor most other patterns depend on, and it is the one the app
 * needs to explain a bad Tuesday without blaming anyone for it.
 */
const CORE: CheckInField[] = ['energy', 'mood', 'sleepHours']

/** At most three more, so no goal ever asks more than six things. */
const EXTRA: Record<GoalArchetype, CheckInField[]> = {
  // Eating is the lever; stress is the most common reason it slips.
  body_composition: ['dietQuality', 'stress'],
  // Load has to be readable, or the plan keeps adding to a body already sore.
  strength: ['soreness', 'dietQuality'],
  endurance: ['soreness', 'stress'],
  // The goal itself. These three are what actually moves a night, so here they
  // are the point rather than an aside.
  sleep_recovery: ['stress', 'caffeineLate', 'alcoholUnits'],
  nutrition_quality: ['dietQuality', 'stress'],
  // One habit at a time, and stress is what breaks a young one.
  habit_routine: ['stress'],
  general_health: ['dietQuality', 'stress'],
}

export const MAX_CHECKIN_FIELDS = 6

export function checkInFields(archetype: GoalArchetype): CheckInField[] {
  return [...CORE, ...EXTRA[archetype]]
}
