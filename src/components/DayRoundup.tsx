'use client'

// The day in one card.
//
// Swiping answers one action, which is right while the day is happening. In
// the evening it is the wrong shape: three open cards is one thought — "two
// yes, one no" — and three separate gestures to express it. This is the same
// answers in one place, two taps wide, no scrolling.
//
// It carries no encouragement, no score and no streak. A person opening this
// at eleven at night on a day that went badly is exactly who the brief's
// no-guilt rule was written for, and a card that says "2 von 3!" is a score
// with a smile on it.

import { useState } from 'react'
import { Card, SectionHeading } from '@/components/ui'
import type { StoredItem } from '@/lib/db/week-plan'
import type { PlanItemStatus } from '@/lib/domain/types'

export function DayRoundup({
  items,
  onStatus,
  label,
}: {
  /** Only what is still open. A settled action has nothing to ask. */
  items: StoredItem[]
  onStatus: (id: string, status: PlanItemStatus) => void
  /** "Heute" or the weekday, so a past day does not claim to be today. */
  label: string
}) {
  // Answered rows stay in place rather than vanishing: a list that shortens
  // under the thumb makes the next row jump into the place you were aiming at.
  const [answered, setAnswered] = useState<Record<string, PlanItemStatus>>({})

  function set(id: string, status: PlanItemStatus) {
    setAnswered((prev) => ({ ...prev, [id]: status }))
    onStatus(id, status)
  }

  if (items.length === 0) return null

  return (
    <>
      <SectionHeading>{label} nachtragen</SectionHeading>
      <Card>
        <ul className="flex flex-col">
          {items.map((item, index) => {
            const given = answered[item.id]
            return (
              <li
                key={item.id}
                className={`flex items-center gap-3 py-2.5 ${index > 0 ? 'border-t border-line' : ''}`}
              >
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    given ? 'text-faint line-through' : 'text-ink'
                  }`}
                >
                  {item.title}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => set(item.id, 'done')}
                    aria-pressed={given === 'done'}
                    aria-label={`${item.title} als erledigt markieren`}
                    className={`h-10 w-10 rounded-control border text-base ${
                      given === 'done'
                        ? 'border-accent bg-accent text-white'
                        : 'border-line-strong text-muted'
                    }`}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => set(item.id, 'missed')}
                    aria-pressed={given === 'missed'}
                    aria-label={`${item.title} als nicht geschafft markieren`}
                    className={`h-10 w-10 rounded-control border text-base ${
                      given === 'missed'
                        ? 'border-warn bg-warn text-white'
                        : 'border-line-strong text-muted'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
