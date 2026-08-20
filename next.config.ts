import type { NextConfig } from 'next'

/**
 * Security headers.
 *
 * Deliberately only the directives that need no nonce. A `default-src` or
 * `script-src` without one would block Next's own inline bootstrap script and
 * white-screen the app — the full policy arrives with `proxy.ts` in the auth
 * step, where a nonce can be generated per request. Half a CSP that works beats
 * a whole one that is switched off again after the first outage.
 *
 * See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
 */
const CONTENT_SECURITY_POLICY = [
  // Clickjacking. Also covered by X-Frame-Options for older browsers.
  "frame-ancestors 'none'",
  // No Flash, no Java, no legacy plugin surface.
  "object-src 'none'",
  // Stops an injected <base> tag from re-pointing every relative URL.
  "base-uri 'self'",
  // A form can only post back to this origin, never to someone else's.
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
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
