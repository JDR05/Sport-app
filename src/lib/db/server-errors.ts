// A server-side failure that nobody would otherwise see.
//
// `reportError` in errors.ts runs in the browser and covers a render that
// crashed. This covers the opposite and quieter case: a server action that
// returns normally, with a 200 in the log, having done nothing.
//
// That is not hypothetical. `setItemStatus` reported success whenever Postgres
// reported no error — and an update matching no rows is not an error, it is a
// statement that changed nothing. Every tap looked recorded, the optimistic
// value stayed on screen, and the verdict was gone on the next load. Nothing
// in the request log, nothing in the build, nothing in 2000 tests: the only
// symptom was a person saying "it does not save".

import 'server-only'
import { createClient } from '@/lib/supabase/server'

const LIMITS = { message: 500 } as const

/**
 * Records one server-side failure. Never throws, never blocks.
 *
 * Deliberately fire-and-forget: a failure to record a failure must not become
 * a second one, and the caller is in the middle of answering a person.
 */
export function reportServerError(message: string, profileId: string | null): void {
  void (async () => {
    try {
      const supabase = await createClient()
      await supabase.from('error_reports').insert({
        profile_id: profileId,
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
        path: 'server-action',
        message: message.slice(0, LIMITS.message),
        stack: null,
        source: 'server',
      })
    } catch {
      // Best effort by definition.
    }
  })()
}
