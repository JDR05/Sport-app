'use client'

// One line that opens, for everything that is not today's actions.

import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * A single line that opens.
 *
 * Today had grown to nine stacked blocks — an impulse, a question, the
 * commitments, the standing rules, the actions, a note, a check-in with eight
 * scales in it, and a question box. Every one of them earned its place on its
 * own and together they buried the three things somebody opens the app for.
 *
 * The rule this encodes: anything that is not today's actions is one line
 * until it is asked for. Nothing is removed and nothing is hidden — the line
 * says what is behind it.
 */
export function Disclosure({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3 rounded-[3px] border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-ink">
          {label}
          {hint && <span className="ml-2 font-normal text-faint">{hint}</span>}
        </span>
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

      {open && <div className="border-t border-line p-3.5">{children}</div>}
    </div>
  )
}
