'use client'

// One day of the week, as a row you can tap.
//
// This used to be a day you could open and answer in place — the same actions,
// the same rings, the same reasoning as Heute, on a second screen. It was built
// that way because Heute could only show today, so a past day had to be
// answerable from somewhere. Heute can step across the week now, and two
// screens that both record the same thing is the clutter this app keeps having
// to remove: "der Abschnitt Plan ist eigentlich dann überflüssig, da wir ja
// alles in Heute haben."
//
// So the split is by *question* rather than by data. Heute answers "was ist
// heute wichtig, und wie lief der Tag"; this answers "was kommt als Nächstes",
// which is the one the day view structurally cannot answer — you would have to
// tap through seven days to find out where the next gym session sits.
//
// Which means this row shows and does not edit. Tapping it opens Heute on that
// day, where the recording happens. One place to record, one place to survey.

import Link from 'next/link'
import { openCount, type DayPosition } from '@/lib/domain/weekDays'
import type { Commitment, PlanItemStatus, PlannedItem, Weekday } from '@/lib/domain/types'

const WEEKDAY_LONG: Record<Weekday, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

type Item = PlannedItem & { id: string; status: PlanItemStatus }

export function PlanDay({
  weekday,
  date,
  items,
  fixed,
  position,
  href,
}: {
  weekday: Weekday
  date: string
  items: Item[]
  /** What this person already had on that day, before the app said anything. */
  fixed: Commitment[]
  position: DayPosition
  /** Heute, on this day. */
  href: string
}) {
  const done = items.filter((i) => i.status === 'done').length
  const unanswered = openCount(items, position)

  return (
    <Link
      href={href}
      aria-current={position === 'today' ? 'date' : undefined}
      className={`flex items-center gap-3 rounded-[3px] border bg-surface px-3.5 py-3 ${
        position === 'today' ? 'border-ink/25' : 'border-line'
      }`}
    >
      {/* The accent bar is the whole "you are here" signal. A coloured word
          next to six grey ones is easy to miss while scrolling; a rule down the
          side of the row is not. */}
      <span
        aria-hidden
        className={`h-8 w-px shrink-0 ${position === 'today' ? 'bg-accent' : 'bg-line'}`}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={`text-[15px] leading-snug ${
              position === 'today' ? 'font-semibold text-ink' : 'font-medium text-muted'
            }`}
          >
            {WEEKDAY_LONG[weekday]}
          </span>
          {position === 'today' ? (
            <span className="label text-[10px] font-semibold text-accent">heute</span>
          ) : (
            <span className="num text-[11px] text-faint">{shortDate(date)}</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-faint">
          {daySummary(items, fixed)}
        </span>
      </span>

      {unanswered > 0 && (
        <span className="label shrink-0 rounded-[2px] border border-line px-1.5 py-px text-[10px] font-semibold text-ink">
          {unanswered} offen
        </span>
      )}

      {items.length > 0 && (
        <span className="num shrink-0 text-[11px] text-faint">
          {done}/{items.length}
        </span>
      )}

      {/* Points right, because this row goes somewhere. The old one pointed
          down and opened in place. */}
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 text-faint">
        <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

/** "4.9." — enough to place the day, short enough not to crowd the row. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(day)}.${Number(month)}.`
}

/**
 * What the row says about the day.
 *
 * A week view whose rows say nothing but "Donnerstag" is worse than the wall of
 * expanded days it replaced. So the line names what is actually on the day —
 * the fixed appointment first, because that is the thing the person recognises
 * — and only then what the app put on top of it.
 */
export function daySummary(
  items: Array<Pick<Item, 'title' | 'cadence'>>,
  fixed: Commitment[],
): string {
  const parts: string[] = []
  for (const commitment of fixed) parts.push(commitment.label)

  if (items.length > 0) {
    const planned = items.filter((i) => i.cadence !== 'daily')
    const rules = items.length - planned.length
    if (planned.length > 0) parts.push(planned.map((i) => i.title).join(' · '))
    if (rules > 0) parts.push(rules === 1 ? '1 Tagesregel' : `${rules} Tagesregeln`)
  }

  return parts.length === 0 ? 'Ruhetag' : parts.join(' · ')
}
