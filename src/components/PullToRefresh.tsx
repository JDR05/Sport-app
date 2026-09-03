'use client'

// Pull down to reload.
//
// The gesture was not merely missing, it was switched off: `overscroll-behavior-y:
// none` on `html` was added so the shell would not rubber-band, and it takes the
// browser's own pull-to-refresh with it. So the one thing everybody tries when a
// screen looks stale did nothing at all.
//
// Turning the native one back on would mean a full page reload — a second of
// white, the week fetched again from scratch, and every open card closed. This
// does the thing the person actually meant: it re-fetches the data in place.
// Nothing is thrown away, and it works the same way in a browser tab and in an
// installed app, where there is no browser chrome to reload from.
//
// Only at the very top of the page, only when the finger goes downwards, and
// with resistance so it cannot be triggered by scrolling. A gesture that fires
// by accident is worse than one that is missing.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** How far the finger has to travel, in pixels of *indicator*, not of finger. */
const THRESHOLD = 64

/** Past this the indicator stops growing, so a long drag is not a long bar. */
const MAX_PULL = 96

/**
 * Half of the finger's movement. The resistance is what separates a pull from
 * a scroll: without it the bar leaps out at the top of every list.
 */
const RESISTANCE = 0.5

/**
 * How far the indicator is out, for a finger that has travelled `delta`.
 *
 * Exported and pure because it is the whole feel of the gesture, and because
 * the alternative to testing it is testing it by hand on a phone this
 * environment does not have. Never negative: an upward drag is a scroll, not a
 * pull of minus forty pixels.
 */
export function pullFor(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.min(MAX_PULL, delta * RESISTANCE)
}

/** Whether releasing now would refresh. */
export function wouldRefresh(pull: number): boolean {
  return pull >= THRESHOLD
}

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void | Promise<unknown>
  children: ReactNode
}) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  // Whether a finger is currently down. State rather than a ref because the
  // indicator's transition depends on it, and it changes twice per gesture
  // rather than on every frame.
  const [dragging, setDragging] = useState(false)

  // Refs rather than state: these change on every touch frame, and a render
  // per frame is how a gesture starts feeling like porridge.
  const startY = useRef<number | null>(null)
  const pulled = useRef(0)
  const running = useRef(false)

  const finish = useCallback(async () => {
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      // A refresh that fails still has to let go of the screen. The failure
      // itself is the caller's to report — this component only knows that the
      // gesture is over.
      setBusy(false)
      setPull(0)
    }
  }, [onRefresh])

  useEffect(() => {
    function onStart(event: TouchEvent) {
      // Only from the top, and only for a single finger: a pinch that happens
      // to start at the top of the page is not a pull.
      if (running.current || window.scrollY > 0 || event.touches.length !== 1) {
        startY.current = null
        return
      }
      startY.current = event.touches[0].clientY
      pulled.current = 0
      setDragging(true)
    }

    function onMove(event: TouchEvent) {
      if (startY.current === null || running.current) return

      const delta = event.touches[0].clientY - startY.current
      if (delta <= 0) {
        // Scrolling up out of a pull. Give the page back rather than holding
        // the gesture hostage.
        startY.current = null
        pulled.current = 0
        setDragging(false)
        setPull(0)
        return
      }

      // The page must not scroll while the bar is out, or the two fight each
      // other. Needs a non-passive listener, which is why this is an effect
      // and not an onTouchMove prop — React attaches those passively.
      if (event.cancelable) event.preventDefault()

      const next = pullFor(delta)
      pulled.current = next
      setPull(next)
    }

    function onEnd() {
      setDragging(false)
      if (startY.current === null) return
      const reached = wouldRefresh(pulled.current)
      startY.current = null
      pulled.current = 0

      if (!reached) {
        setPull(0)
        return
      }

      running.current = true
      void finish().finally(() => {
        running.current = false
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [finish])

  const active = busy || pull > 0
  const height = busy ? THRESHOLD / 2 : pull
  const ready = wouldRefresh(pull)

  return (
    <>
      {/* A hairline that fills, not a spinning circle. The app is a measuring
          instrument: a bar that is either short of the mark or past it says
          more than a shape that spins whatever happens. */}
      {/* Opaque, and only while it is doing something.
          
          It sits above the sticky header, so a transparent strip put "Wird
          geladen" straight across "Trace — Heute" — two labels in the same
          twelve pixels, which is what the screenshot showed. A pull-down shade
          that covers the header while it is pulled reads as one gesture; a
          floating word over the wordmark reads as a broken screen. */}
      <div
        aria-hidden={!busy}
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 flex items-end justify-center overflow-hidden ${
          active ? 'bg-paper' : ''
        }`}
        style={{
          height: `${height}px`,
          // No transition while the finger is down — the bar has to track it
          // exactly — and one on the way back, so releasing does not snap.
          transition: dragging ? undefined : 'height var(--motion-enter, 160ms)',
        }}
      >
        {active && (
          <div className="w-full px-5 pb-1.5">
            <div className="h-[3px] w-full overflow-hidden bg-sunken">
              <div
                className="h-full bg-accent"
                style={{ width: busy ? '100%' : `${Math.min(100, (pull / THRESHOLD) * 100)}%` }}
              />
            </div>
            <p className="label mt-1.5 text-center text-[10px] font-semibold text-faint">
              {busy ? 'Wird geladen' : ready ? 'Loslassen' : 'Zum Aktualisieren ziehen'}
            </p>
          </div>
        )}
      </div>

      {children}
    </>
  )
}
