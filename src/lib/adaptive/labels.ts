// German labels for everything the adaptive engine says out loud.
//
// Separate from the logic so a wording change never touches a threshold, and
// so the detection modules stay free of user-facing text.

import type { PlanDomain, TimeSlot, Weekday } from '@/lib/domain/types'

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
}

export const SLOT_LABELS: Record<TimeSlot, string> = {
  early: 'Morgens',
  midday: 'Mittags',
  evening: 'Abends',
}

export const DOMAIN_LABELS: Record<PlanDomain, string> = {
  nutrition: 'Ernährung',
  training: 'Training',
  movement: 'Bewegung',
  sleep: 'Schlaf',
  self_improvement: 'Persönliche Entwicklung',
  priority: 'Priorität',
}
