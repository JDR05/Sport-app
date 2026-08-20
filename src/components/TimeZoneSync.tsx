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

    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TIMEZONE_COOKIE}=`))
      ?.slice(TIMEZONE_COOKIE.length + 1)

    if (current === zone) return

    // Lax so it survives normal navigation; not httpOnly because the client is
    // the only thing that knows the answer in the first place.
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }, [router])

  return null
}
