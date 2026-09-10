'use client'

// The hour on the person's own clock, read only once the browser exists.
//
// `new Date().getHours()` looks harmless in a client component and is not: a
// client component is still rendered on the server for the first HTML, where
// the clock is UTC. Between 16:00 and 17:00 UTC the server said "not evening"
// and a phone in Berlin said "evening", so the two renders disagreed and React
// had a hydration mismatch on the card that exists to make answering easy.
//
// `useSyncExternalStore` is the shape for exactly this, and the app already
// uses it for the notification permission: the server snapshot says "unknown"
// instead of guessing, and the client fills it in after mount.

import { useSyncExternalStore } from 'react'

/** The local hour, or null until the browser has answered. */
export function useLocalHour(): number | null {
  return useSyncExternalStore(
    // Re-read on the hour, so a card that should appear at 17:00 does not wait
    // for the next navigation. Cheap: one timer per mounted screen.
    (onChange) => {
      const timer = setInterval(onChange, 60_000)
      return () => clearInterval(timer)
    },
    () => new Date().getHours(),
    // The server cannot know and must not guess. Null renders nothing, which
    // is the same thing the person saw a moment before hydration anyway.
    () => null,
  )
}
