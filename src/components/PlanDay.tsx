'use client'

// One day of the week, open or closed.
//
// The Plan screen used to draw all seven days fully expanded, in order, always
// starting at Monday. On a Thursday that meant three days of finished work
// scrolled past before the day you are actually in — "da möchte ich nicht allen
// bei Montag stehen, obwohl grad Donnerstag ist".
//
// So the day you are in is open and the others are closed, and closed is not
// hidden: the row still says how many actions the day has, how many are done,
// and what fixed appointment sits on it. That is the part a week view is for —
// seeing the shape of the week without reading it.
//
// Past days open too, and open answerable. That is deliberate and it is the
// point of this screen: the person is the one who decides what happened
// yesterday, and until now the app counted the gap on Progress without ever
// offering a place to close it.

import { useState } from 'react'
import { ActionItem } from '@/components/ActionItem'
import { CommitmentLine, commitmentsForDay } from '@/components/DayCommitments'
import { DomainBadge, Reasoning } from '@/components/ui'
import { isAiAuthored } from '@/lib/engine/proposed'
import type { Reaction, StatusReason } from '@/lib/adaptive/reaction'
import type { Commitment, PlanItemStatus, PlannedItem, Weekday } from '@/lib/domain/types'

const WEEKDAY_LONG: Record<Weekday, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

type Item = PlannedItem & { id: string; status: PlanItemStatus }

/** Where a day sits relative to the day the person is in. */
export type DayPosition = 'past' | 'today' | 'future'

/**
 * Which of the three a day is.
 *
 * `today === null` means the client's date has not arrived yet. Everything is
 * then `future`, which is the safe reading in both directions: nothing opens by
 * default, and nothing becomes answerable on a guess about which days passed.
 */
export function dayPosition(date: string, today: string | null): DayPosition {
  if (today === null) return 'future'
  if (date === today) return 'today'
  return date < today ? 'past' : 'future'
}

/**
 * Whether this day may be answered.
 *
 * An action that has not happened yet cannot have been missed, so offering the
 * choice would invite an answer that means nothing. Everything up to and
 * including today is the person's to correct.
 */
export function canAnswer(position: DayPosition): boolean {
  return position !== 'future'
}

/** Only a day that has already passed can be behind. */
export function openCount(items: Array<{ status: PlanItemStatus }>, position: DayPosition): number {
  if (position !== 'past') return 0
  return items.filter((i) => i.status === 'unknown' || i.status === 'planned').length
}

export function PlanDay({
  weekday,
  date,
  items,
  commitments,
  commitmentNotes,
  position,
  onStatus,
  onAnswer,
  onAccept,
}: {
  weekday: Weekday
  date: string
  items: Item[]
  commitments: Commitment[]
  commitmentNotes?: Record<string, string>
  /** Where this day sits relative to the day the person is in. */
  position: DayPosition
  onStatus: (itemId: string, status: PlanItemStatus) => void
  onAnswer: (
    itemId: string,
    status: PlanItemStatus,
    reason: StatusReason,
    note: string | null,
  ) => Promise<Reaction | null>
  onAccept: (itemId: string) => Promise<Reaction | null>
}) {
  // Open is where you are. Everything else is a row you can tap.
  const [open, setOpen] = useState(position === 'today')
  const fixed = commitmentsForDay(commitments, weekday)

  const answerable = canAnswer(position)
  const done = items.filter((i) => i.status === 'done').length
  const unanswered = openCount(items, position)

  return (
    <section
      className={`rounded-[3px] border bg-surface ${
        position === 'today' ? 'border-ink/25' : 'border-line'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        {/* The accent bar is the whole "you are here" signal. A coloured word
            next to six grey ones is easy to miss while scrolling; a rule down
            the side of the row is not. */}
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
          <span className="mt-0.5 block truncate text-xs text-faint">{daySummary(items, fixed)}</span>
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

        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          className={`shrink-0 text-faint transition-transform duration-[var(--motion-enter)] ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path
            d="M5 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
          {/* What the person already had, on the day it happens. The plan was
              built around it, so it comes before what the plan added. */}
          {fixed.map((commitment) => (
            <CommitmentLine
              key={`${commitment.start}-${commitment.label}`}
              commitment={commitment}
              note={commitmentNotes?.[commitment.label]}
            />
          ))}

          {items.length === 0 && fixed.length === 0 && (
            <p className="text-sm text-faint">Ruhetag — gehört zum Plan.</p>
          )}

          {items.map((item) =>
            answerable ? (
              <ActionItem
                key={item.id}
                item={item}
                status={item.status}
                onStatus={(status) => onStatus(item.id, status)}
                onAnswer={(status, reason, note) => onAnswer(item.id, status, reason, note)}
                onAccept={() => onAccept(item.id)}
              />
            ) : (
              <div key={item.id} className="rounded-[2px] border border-line bg-sunken/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isAiAuthored(item) && (
                      <span className="label rounded-[2px] border border-line px-1.5 py-px text-[10px] font-semibold text-faint">
                        KI
                      </span>
                    )}
                    <DomainBadge domain={item.domain} track={item.track} />
                  </div>
                </div>
                <Reasoning>{item.rationale.text}</Reasoning>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  )
}

/** "4.9." — enough to place the day, short enough not to crowd the row. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(day)}.${Number(month)}.`
}

/**
 * What the closed row says about the day.
 *
 * A collapsed day that says nothing but "Donnerstag" is a worse week view than
 * the fully expanded one it replaced. So the line names what is actually on the
 * day — the fixed appointment first, because that is the thing the person
 * recognises — and only then how much the app put on top of it.
 */
export function daySummary(items: Array<Pick<Item, 'title' | 'cadence'>>, fixed: Commitment[]): string {
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
