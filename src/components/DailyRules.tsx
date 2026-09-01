'use client'

// The standing rules, as one card.
//
// A calorie corridor, protein at every meal, a bedtime — these are true every
// day, and once the week is materialised they are genuinely on every day. Shown
// as full action cards they would bury the two or three things that are
// actually specific to today, and the brief caps Today at three to five
// actions for exactly that reason.
//
// So they get one card with one ring: tap it and the day's rules are done
// together, which is also how someone thinks about them. Each rule can still be
// answered on its own inside — the adaptive engine measures them separately and
// would learn nothing from a single collapsed verdict.

import { useState } from 'react'
import { CheckRing } from '@/components/CheckRing'
import { Card, DOMAIN_LABEL } from '@/components/ui'
import type { PlanItemStatus, PlannedItem } from '@/lib/domain/types'

type Item = PlannedItem & { id: string; status: PlanItemStatus }

export function DailyRules({
  items,
  onStatus,
}: {
  items: Item[]
  onStatus: (itemId: string, status: PlanItemStatus) => void
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  const done = items.filter((i) => i.status === 'done').length
  const allDone = done === items.length

  return (
    <Card>
      <div className="flex items-start gap-3">
        <CheckRing
          status={allDone ? 'done' : 'unknown'}
          label="Tagesregeln"
          // All or nothing on the outer ring: it is a summary of the rules
          // below, so it must never claim more than they say.
          onToggle={() => {
            for (const item of items) onStatus(item.id, allDone ? 'unknown' : 'done')
          }}
        />

        <div className="min-w-0 flex-1 pt-1">
          <h3 className="text-[15px] font-semibold leading-snug text-ink">Jeden Tag</h3>
          <p className="mt-1 text-xs text-faint">
            <span className="num">{done}</span> von <span className="num">{items.length}</span> · {items.map((i) => DOMAIN_LABEL[i.domain]).filter((v, idx, a) => a.indexOf(v) === idx).join(' · ')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Weniger zeigen' : 'Regeln einzeln zeigen'}
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
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!open && (
        <ul className="mt-2.5 space-y-1 pl-14 text-sm text-muted">
          {items.map((item) => (
            <li key={item.id} className={item.status === 'done' ? 'line-through decoration-1' : ''}>
              {item.title}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <CheckRing
                status={item.status}
                label={item.title}
                onToggle={() => onStatus(item.id, item.status === 'done' ? 'unknown' : 'done')}
              />
              <div className="min-w-0 flex-1 pt-1">
                <p
                  className={`text-sm font-medium leading-snug text-ink ${
                    item.status === 'done' ? 'line-through decoration-1' : ''
                  }`}
                >
                  {item.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{item.rationale.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
