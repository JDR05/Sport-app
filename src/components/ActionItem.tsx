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

const OTHER: Array<{ status: PlanItemStatus; label: string }> = [
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
      className={`rounded-2xl border border-line bg-surface transition-opacity ${settled ? 'opacity-65' : ''}`}
    >
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
              <span className="text-xs tabular-nums text-faint">
                {item.plannedDurationMin} Min
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Weniger zeigen' : 'Warum, und andere Antworten'}
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
            {OTHER.map((option) => (
              <button
                key={option.status}
                type="button"
                aria-pressed={status === option.status}
                onClick={() => onStatus(status === option.status ? 'unknown' : option.status)}
                className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--motion-tap)] ${
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
