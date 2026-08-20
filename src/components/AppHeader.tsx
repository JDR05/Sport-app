'use client'

// The app's own header.
//
// It exists because the brand was, until now, invisible: the wordmark sat on
// the login screen, which someone already signed in never sees again. An app
// you open every day should say what it is.
//
// Deliberately quiet — a hairline, the mark, the name, and where you are. It
// stays put while the screen scrolls, so the answer to "where am I" survives
// after the screen title has scrolled out of sight.

import { usePathname } from 'next/navigation'
import { LogoMark } from '@/components/Logo'
import { screenLabel } from '@/components/tabs'

export function AppHeader() {
  const screen = screenLabel(usePathname())

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2 px-5 py-3">
        <LogoMark size={18} className="shrink-0 text-ink" />
        <span className="text-[15px] font-semibold tracking-tight text-ink">Cadence</span>
        {screen && (
          <>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span className="text-[15px] text-muted">{screen}</span>
          </>
        )}
      </div>
    </header>
  )
}
