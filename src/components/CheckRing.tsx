'use client'

// The one gesture the app is used for.
//
// Drawn as a ring because the ring is this product's shape: it is the mark, it
// is the weekly score, and now it is the control. Three places using the same
// form is what makes an app look like itself rather than like a component
// library — and it is literal here, not decorative, because every one of these
// taps is a segment of the ring on Progress.
//
// Deliberately large. 44px is the smallest thing a thumb hits reliably, and
// this is the control someone uses five times a day, half-awake, one-handed.
//
// Transitions are on colour only, never on layout: an animated size change
// costs a frame and reads as lag, which is the complaint that started this.
//
// The empty state shows the tick it will draw, at low opacity. "Erledigt" was
// the only answer in the app with no word attached to it — the other three sit
// behind the disclosure as labelled buttons, and this one was a bare circle.

import type { PlanItemStatus } from '@/lib/domain/types'

export function CheckRing({
  status,
  label,
  onToggle,
}: {
  status: PlanItemStatus
  label: string
  onToggle: () => void
}) {
  const done = status === 'done'
  const other = status === 'moved' || status === 'missed' || status === 'not_relevant'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done ? `${label}: erledigt, antippen zum Zurücknehmen` : `${label} als erledigt markieren`}
      className="-m-1.5 shrink-0 p-1.5"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors duration-[var(--motion-tap)] ${
          done
            ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
            : other
              ? 'border-line bg-sunken text-muted'
              // Stronger than a hairline: an empty ring has to read as
              // something you can press, not as a decorative outline.
              : 'border-faint/50 bg-surface text-faint active:border-accent'
        }`}
      >
        {done ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M4.5 10.5 8 14l7.5-8"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : other ? (
          // A settled-but-not-done item reads as closed, not as failed. A cross
          // would be a verdict; a dash is a fact.
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M6 10h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        ) : (
          // The untouched state shows the tick it is about to draw, faintly.
          //
          // An empty circle is a convention people have been taught elsewhere,
          // and this app had not taught it: "erledigt" was the one answer with
          // no word attached to it anywhere on the screen. Faint enough that
          // nobody reads it as already done — it says what the tap will do,
          // it does not claim it has happened.
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="opacity-30">
            <path
              d="M4.5 10.5 8 14l7.5-8"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  )
}
