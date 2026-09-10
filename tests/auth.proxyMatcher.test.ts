// What the sign-in wall is allowed to stand in front of.
//
// The wall is a regular expression, which is the wrong shape for a rule people
// have to reason about: a path is either in it or not, and nobody can tell
// which by reading. It has now been got wrong twice for the same reason.
//
// The manifest first: a browser fetches it before anyone has signed in, got
// the login page back, and the app could not be added to a home screen at all.
// Then sw.js, which has the identical property — fetched by the browser on its
// own schedule, at a moment nobody controls, and re-fetched later to check for
// an update when the session may have lapsed. It came back as text/html, so
// the registration was rejected, and the catch beside `register()` swallowed
// it in silence.
//
// So the expression is exercised against real paths here rather than read.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The matcher, compiled from the file the app actually ships.
 *
 * The backslashes have to be halved on the way: the file holds TypeScript
 * source, where every `\.` in the expression is written `\\.`, and feeding
 * that to RegExp builds a different pattern than the one Next compiles. The
 * first version of this test skipped that step and every case failed at once,
 * which is the useful way for it to be wrong.
 */
const source = readFileSync('src/proxy.ts', 'utf8')
const pattern = ((source.match(/'(\/\(\(\?!.*)'/) ?? [])[1] ?? '').replace(/\\\\/g, '\\')
const matcher = new RegExp(`^${pattern}$`)

/** Whether the sign-in wall would intercept this path. */
const guarded = (path: string) => matcher.test(path)

describe('what the browser fetches on its own is never sent to the login page', () => {
  // Every one of these is requested by the browser rather than by a person,
  // at a time nobody chooses, sometimes with no session at all.
  it.each([
    ['/sw.js', 'the service worker — a login page here is not a script'],
    ['/manifest.webmanifest', 'fetched before sign-in; without it there is no install prompt'],
    ['/favicon.ico', 'requested on every page, session or not'],
    ['/icon.svg', 'the same'],
    ['/apple-icon.png', 'the home-screen icon'],
  ])('%s stays public — %s', (path) => {
    expect(guarded(path)).toBe(false)
  })
})

describe('everything a person navigates to is still behind it', () => {
  it.each(['/today', '/muster', '/profile', '/playbook', '/onboarding', '/commitments'])(
    '%s is guarded',
    (path) => {
      expect(guarded(path)).toBe(true)
    },
  )

  it('guards the routes that carry data, not just the top level', () => {
    expect(guarded('/api/ai/classify')).toBe(true)
    expect(guarded('/today/anything')).toBe(true)
  })
})

describe('the exclusion is narrow', () => {
  it('does not let every script through, only the worker', () => {
    // 'sw.js' is excluded by name rather than by extension on purpose: a rule
    // that exempts all .js would exempt any future route ending that way.
    expect(guarded('/anything-else.js')).toBe(true)
    expect(guarded('/sw.js')).toBe(false)
  })
})
