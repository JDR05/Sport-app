// The archetype registry.
//
// Adding a goal type means adding a strategy here — and because the interface
// requires `assertInvariants`, a new goal type cannot arrive without its own
// safety limits.

import { bodyComposition } from './bodyComposition'
import { endurance } from './endurance'
import { generalHealth } from './generalHealth'
import { habitRoutine } from './habitRoutine'
import { nutritionQuality } from './nutritionQuality'
import { sleepRecovery } from './sleepRecovery'
import { strength } from './strength'
import type { ArchetypeStrategy } from './types'
import type { GoalArchetype } from '@/lib/domain/types'

export const ARCHETYPES: Record<GoalArchetype, ArchetypeStrategy> = {
  body_composition: bodyComposition,
  strength,
  endurance,
  sleep_recovery: sleepRecovery,
  nutrition_quality: nutritionQuality,
  habit_routine: habitRoutine,
  general_health: generalHealth,
}

export function strategyFor(archetype: GoalArchetype): ArchetypeStrategy {
  return ARCHETYPES[archetype] ?? generalHealth
}

export type { ArchetypeStrategy, ClampedGoal } from './types'
