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
}

export default nextConfig
