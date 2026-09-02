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

/**
 * What made the app speak up, in the person's words.
 *
 * Shown as the heading above an impulse, because "Diese Woche" over a message
 * that arrived on Tuesday because of three „Zu müde" taps is the app hiding
 * its own reasoning. Naming the occasion is the same rule as every rationale
 * in this product: a statement points at what produced it.
 */
export const TRIGGER_LABELS: Record<string, string> = {
  weekly: 'Diese Woche',
  reason_repeated: 'Das kam mehrfach',
  domain_slipping: 'Da bleibt gerade etwas liegen',
  going_well: 'Das läuft',
}
