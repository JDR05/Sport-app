import type { NextConfig } from 'next'

/**
 * Security headers that do not depend on the request.
 *
 * The Content-Security-Policy is NOT here: it needs a fresh nonce per request
 * and therefore lives in `src/lib/supabase/proxy.ts`. Setting a second one here
 * would make the browser enforce both at once, and the strictest parts of two
 * different policies rarely add up to a working page.
 *
 * These still earn their place: the proxy skips static assets, and these do not.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  // No MIME sniffing: an uploaded file cannot talk a browser into running it.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // A health app must not leak the path someone was on to another site.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs a camera, a microphone or a location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Two years, and only over HTTPS from now on.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },

  experimental: {
    /**
     * Let the client router keep a screen it already has.
     *
     * Every screen behind the bottom bar is dynamic, and since Next 15 the
     * client cache holds dynamic segments for zero seconds. So tapping Heute,
     * then Plan, then Heute again was three full server round trips, each one
     * showing the skeleton before the screen it had just rendered. "Wenn ich
     * irgendwo 'n neuen Tab anklick, es geht viel zu lange."
     *
     * Safe here because of where the data actually lives. Heute and Plan are
     * client shells: their content comes from PlanProvider, one fetch shared
     * across the whole app, not from the cached RSC payload. Fortschritt,
     * Insights and Profil do render server data, and thirty seconds is the
     * window in which none of it can have changed without this app knowing —
     * every write goes through a server action that calls router.refresh(),
     * and pull-to-refresh does the same, both of which drop the cache.
     */
    staleTimes: { dynamic: 30, static: 300 },
  },
}

export default nextConfig
