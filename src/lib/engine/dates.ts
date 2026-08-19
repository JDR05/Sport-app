// Minimal date helpers. The engine works on ISO date strings and never reads
// the clock, so that the same input always produces the same plan.

import { WEEKDAYS, type Weekday } from '@/lib/domain/types'

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

export function weekdayOf(iso: string): Weekday {
  // getUTCDay: 0 = Sunday. WEEKDAYS starts on Monday.
  const day = parseIsoDate(iso).getUTCDay()
  return WEEKDAYS[(day + 6) % 7]
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const offset = WEEKDAYS.indexOf(weekdayOf(iso))
  return addDays(iso, -offset)
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()
  return Math.round(ms / 86_400_000)
}

export function formatGermanDate(iso: string): string {
  const d = parseIsoDate(iso)
  const months = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ]
  return `${d.getUTCDate()}. ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function timeSlotOf(start: string): 'early' | 'midday' | 'evening' {
  const hour = Number(start.slice(0, 2))
  if (hour < 11) return 'early'
  if (hour < 16) return 'midday'
  return 'evening'
}
