'use client'

// Tells the server which time zone the person is in, once.
//
// Server-rendered screens otherwise compute "today" in UTC and can end up
// describing a different day — and, across a Sunday, a different week — than
// the Today screen the person is looking at.
//
// Renders nothing. Refreshes only when the value actually changes, so it costs
// one extra render on the first visit and none afterwards.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TIMEZONE_COOKIE } from '@/lib/engine/localDate'

export function TimeZoneSync() {
  const router = useRouter()

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone) return

    // Decoded before comparing, because it was written encoded. Without this
    // the stored "Europe%2FBerlin" never equalled "Europe/Berlin", so the
    // check below never matched and every full page load rewrote the same
    // cookie and asked the server to render the page again — the one round
    // trip this component exists to avoid, turned into one every time.
    const current = readCookie(TIMEZONE_COOKIE)
    if (current === zone) return

    // Lax so it survives normal navigation; not httpOnly because the client is
    // the only thing that knows the answer in the first place.
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }, [router])

  return null
}

/** The cookie's value as it was written, or undefined. Never throws. */
function readCookie(name: string): string | undefined {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1)
  if (raw === undefined) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    // A malformed escape sequence — someone else's cookie, or a truncated
    // one. Treating it as absent rewrites it, which is the right repair.
    return undefined
  }
}
