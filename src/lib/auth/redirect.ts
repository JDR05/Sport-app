// Where a person is sent after signing in.
//
// The target comes from a query parameter, which means it comes from whoever
// wrote the link. Passed to `redirect()` unchecked, that is an open redirect: a
// mail saying "your plan is waiting" links to the real login screen, the person
// signs in for real, and then lands on a copy that asks them to sign in again.
// The credentials are handed over on the second screen, and nothing about the
// first one looked wrong.
//
// So: same-origin paths only, and anything else silently becomes the start page.

const FALLBACK = '/'

export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return FALLBACK

  // Must be a path on this site. `//evil.example` is a protocol-relative URL
  // and would leave the origin, so one leading slash is not enough.
  if (!value.startsWith('/') || value.startsWith('//')) return FALLBACK

  // Some browsers read a backslash as a slash when parsing a URL.
  if (value.includes('\\')) return FALLBACK

  // No bouncing straight back into the auth screens.
  if (value.startsWith('/login') || value.startsWith('/signup')) return FALLBACK

  return value
}
