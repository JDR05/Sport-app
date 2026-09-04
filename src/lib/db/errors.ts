// Reporting a crash to the operator's own database.
//
// The usual answer is Sentry, and for this app it is the wrong one. Every
// screen here is about health data; a stack trace carries the path and often
// the state that produced it, and session replay carries the screen. That is a
// second processor, a second Art. 28 contract, and a second place Art. 9 data
// can end up. The database is where the data already is, so reporting there
// adds no recipient and no contract.
//
// The trade is that this is not a monitoring product — no grouping, no alerts,
// no release comparison. It answers one question, which is the one that was
// unanswerable before: *did the app break for somebody, and where.*

import { createClient } from '@/lib/supabase/client'

export type ErrorSource = 'render' | 'server' | 'client'

/** Matches the column constraints, so a long value is trimmed rather than refused. */
const LIMITS = { path: 200, message: 500, stack: 4000 } as const

/**
 * The route, with anything that could carry a value stripped.
 *
 * A query string is where user data hides — `?tag=2026-09-04` is harmless,
 * `?q=<whatever somebody typed>` is not, and the difference cannot be judged
 * here. Dropping the whole thing costs a little context and removes the entire
 * question.
 */
function safePath(): string {
  if (typeof window === 'undefined') return 'server'
  return window.location.pathname.slice(0, LIMITS.path)
}

/**
 * Sends one report. Never throws, never blocks, never retries.
 *
 * A failure to report a crash must not become a second crash, and an error
 * boundary that awaits a network call before rendering its message is a blank
 * screen for as long as the network is bad — which is exactly when things break.
 */
export function reportError(
  error: unknown,
  source: ErrorSource,
  profileId: string | null = null,
): void {
  try {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    void createClient()
      .from('error_reports')
      .insert({
        profile_id: profileId,
        release: process.env.NEXT_PUBLIC_RELEASE ?? null,
        path: safePath(),
        message: message.slice(0, LIMITS.message),
        stack: stack ? stack.slice(0, LIMITS.stack) : null,
        source,
      })
      .then(() => {})
  } catch {
    // Reporting is best-effort by definition. If this path throws, the app is
    // already in the state the report was about.
  }
}
