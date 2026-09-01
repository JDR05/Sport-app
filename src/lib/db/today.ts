// The current date as the person experiences it, on the server.
//
// Falls back to UTC when the cookie is missing — the first render after a fresh
// sign-in, essentially — which is the same answer the code gave before, so the
// fallback cannot be worse than what it replaces.

import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { isValidTimeZone, localToday, TIMEZONE_COOKIE } from '@/lib/engine/localDate'

export const serverToday = cache(async function serverToday(): Promise<string> {
  const zone = (await cookies()).get(TIMEZONE_COOKIE)?.value
  return localToday(new Date(), isValidTimeZone(zone) ? zone : undefined)
})
