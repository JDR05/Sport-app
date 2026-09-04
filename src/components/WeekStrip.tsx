'use client'

// The week, along the top of Heute.
//
// Heute showed exactly one day and there was no way off it. So a Wednesday
// somebody forgot to fill in stayed forgotten: the actions could be answered
// from the Plan screen, but the part that says how the day actually *felt* —
// energy, stress, sleep, the note — had no screen at all once the day was over.
// That is the half the adaptive engine learns the most from, and it was the
// half with no way back to it.
//
// "Oben wo Freitag steht rüber wechseln können zu den Tagen davor und danach …
//  somit kann ich noch Notizen einfügen oder den Teil wie war dein Tag
//  bearbeiten und die KI weiß dann mehr."
//
// Seven chips rather than two arrows. Arrows say "there is a next one"; the
// strip says which days exist, which one you are on, and — through the dot —
// which ones still have nothing recorded. That last part is the whole reason to
// go back, and an arrow cannot show it.

import type { Weekday } from '@/lib/domain/types'
import { addDays, weekdayOf } from '@/lib/engine/dates'

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So',
}

export function WeekStrip({
  weekStart,
  selected,
  today,
  recorded,
  onSelect,
}: {
  weekStart: string
  /** The day being shown. */
  selected: string
  /** The real today, which is a position on the strip, not the selection. */
  today: string
  /** Days that already carry a check-in. */
  recorded: ReadonlySet<string>
  onSelect: (date: string) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <nav aria-label="Tag wählen" className="mb-5 grid grid-cols-7 gap-1">
      {days.map((date) => {
        const isSelected = date === selected
        const isToday = date === today
        // Days that have not happened cannot be reported on, so the chip says
        // so rather than leading somewhere that refuses the person.
        const ahead = date > today

        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            aria-current={isSelected ? 'date' : undefined}
            aria-label={`${WEEKDAY_SHORT[weekdayOf(date)]}, ${dayOf(date)}.`}
            className={`flex flex-col items-center gap-1 rounded-[3px] border py-2 transition-colors duration-[var(--motion-tap)] ${
              isSelected
                ? 'border-ink bg-sunken'
                // Unselected chips are still buttons somebody has to hit, but
                // seven bordered boxes across a phone is the wall of chrome the
                // brief rules out. The weekday label carries the affordance
                // instead, which is what WCAG 1.4.11 means by "identifiable by
                // other means" — so the border stays off rather than becoming a
                // hairline nobody can see either.
                : 'border-transparent bg-transparent'
            }`}
          >
            <span
              className={`label text-[10px] font-semibold ${
                isToday ? 'text-accent' : isSelected ? 'text-ink' : 'text-faint'
              }`}
            >
              {WEEKDAY_SHORT[weekdayOf(date)]}
            </span>
            <span
              className={`num text-[13px] ${
                isSelected ? 'font-semibold text-ink' : ahead ? 'text-faint' : 'text-muted'
              }`}
            >
              {dayOf(date)}
            </span>
            {/* Recorded, or nothing at all. A tick under the day, not a dot:
                the app is a measuring instrument and this is a mark on a scale.
                
                Deliberately nothing on the days without one — no cross, no
                empty ring. A missing check-in is missing information, never a
                failure, and a row of little absences is the guilt mechanic the
                brief rules out. */}
            <span
              aria-hidden
              className={`h-[2px] w-3 ${recorded.has(date) ? 'bg-accent' : 'bg-transparent'}`}
            />
          </button>
        )
      })}
    </nav>
  )
}

function dayOf(iso: string): number {
  return Number(iso.slice(8, 10))
}
