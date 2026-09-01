'use client'

// One planned action.
//
// The shape of this card is the answer to two complaints at once. It used to
// show four status buttons across two wrapped rows plus a "Warum?" disclosure —
// so a day with three actions was a wall of twelve buttons and three
// paragraphs, and the thing people actually do five times a day, marking
// something done, took the same effort as the things they almost never do.
//
// Now the common case is one tap on the ring. Everything else — moved, missed,
// did not fit, and the reasoning — lives behind one disclosure, present but not
// in the way. Nothing is hidden from the person; it is just not all shouting.
//
// Four statuses, not three, and that has not changed: `missed` and
// `not_relevant` mean different things to the adaptive engine — one is a
// behavioural signal, the other a planning error — and the user is the only one
// who can tell them apart. Untouched items stay `unknown` and never feed
// pattern detection (ADR-011).

import { useState } from 'react'
import { CheckRing } from '@/components/CheckRing'
import { DomainBadge } from '@/components/ui'
import type { PlannedItem, PlanItemStatus } from '@/lib/domain/types'

/**
 * Every answer, including the one people actually give.
 *
 * `done` used to be missing here, because it lives on the ring. That left the
 * disclosure showing three ways to say it did not happen and no way to say it
 * did — you opened the list of answers and the answer you wanted was not in
 * it. The ring stays the fast path for the common case; this is the complete
 * set, and a set with a hole in it is worse than no set at all.
 */
const ANSWERS: Array<{ status: PlanItemStatus; label: string }> = [
  { status: 'done', label: 'Erledigt' },
  { status: 'moved', label: 'Verschoben' },
  { status: 'missed', label: 'Nicht geschafft' },
  { status: 'not_relevant', label: 'Passte nicht' },
]

export function ActionItem({
  item,
  status,
  onStatus,
}: {
  item: PlannedItem
  status: PlanItemStatus
  onStatus: (status: PlanItemStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const settled = status !== 'planned' && status !== 'unknown'

  return (
    <article
      className={`relative overflow-hidden rounded-[3px] border border-line bg-surface pl-1 transition-opacity ${
        settled ? 'opacity-60' : ''
      }`}
    >
      {/* The mark, on every action.
          
          The logo is two strokes of unequal height: the health baseline that
          runs under every goal, and the goal track on top of it. Here that
          same pair becomes the left edge of the card, and it carries real
          information rather than decorating — a full bar in the live colour is
          a goal action, a short muted one is the baseline. So the thing the
          product is actually about is legible at a glance on every screen, and
          the identity is the information rather than a badge stuck beside it. */}
      <span
        aria-hidden
        className={`absolute bottom-0 left-0 w-1 ${
          item.track === 'goal' ? 'top-0 bg-accent' : 'h-2/5 bg-ink/25'
        }`}
      />

      <div className="flex items-start gap-3 p-3.5">
        <CheckRing
          status={status}
          label={item.title}
          onToggle={() => onStatus(status === 'done' ? 'unknown' : 'done')}
        />

        <div className="min-w-0 flex-1 pt-1">
          <h3
            className={`text-[15px] font-semibold leading-snug text-ink ${
              status === 'done' ? 'line-through decoration-1' : ''
            }`}
          >
            {item.title}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <DomainBadge domain={item.domain} />
            {item.plannedDurationMin && (
              // Measured, so it is set in the mono like every other number the
              // app is willing to be held to.
              <span className="num text-[11px] text-faint">{item.plannedDurationMin} min</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Weniger zeigen' : 'Warum, und alle Antworten'}
          className="-m-2 shrink-0 p-2 text-faint"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
            className={`transition-transform duration-[var(--motion-enter)] ${open ? 'rotate-180' : ''}`}
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
      </div>

      {open && (
        <div className="border-t border-line px-3.5 pb-3.5 pt-3">
          <p className="text-sm leading-relaxed text-muted">{item.rationale.text}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ANSWERS.map((option) => (
              <button
                key={option.status}
                type="button"
                aria-pressed={status === option.status}
                onClick={() => onStatus(status === option.status ? 'unknown' : option.status)}
                className={`label rounded-[2px] border min-h-11 px-3 py-2 text-[11px] font-semibold transition-colors duration-[var(--motion-tap)] ${
                  status === option.status
                    ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                    : 'border-line bg-surface text-muted active:bg-sunken'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
