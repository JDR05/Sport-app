// Open redirect and route exposure.
//
// Both of these are one-line mistakes with real consequences, and both are
// cheap to pin down. The list of hostile inputs below is the point of the file:
// every entry is a shape that has been used against a real login form.

import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/auth/redirect'
import { isPublic } from '@/lib/supabase/proxy'

describe('safeNext', () => {
  it('keeps an ordinary path on this site', () => {
    expect(safeNext('/today')).toBe('/today')
    expect(safeNext('/plan?woche=2')).toBe('/plan?woche=2')
  })

  it.each([
    ['//evil.example', 'protocol-relative URL leaves the origin'],
    ['https://evil.example', 'absolute URL'],
    ['http://evil.example', 'absolute URL'],
    ['/\\evil.example', 'backslash is read as a slash by some browsers'],
    ['\\\\evil.example', 'UNC-style'],
    ['javascript:alert(1)', 'script URL'],
    ['data:text/html,<script>', 'data URL'],
    ['today', 'relative, no leading slash'],
    ['', 'empty'],
  ])('refuses %s (%s)', (input) => {
    expect(safeNext(input)).toBe('/')
  })

  it('refuses anything that is not a string', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext({ toString: () => '/today' })).toBe('/')
  })

  it('does not bounce someone straight back to the login screen', () => {
    expect(safeNext('/login')).toBe('/')
    expect(safeNext('/signup?bestaetigen=1')).toBe('/')
  })
})

describe('isPublic', () => {
  it('lets the auth screens through', () => {
    for (const path of ['/login', '/signup', '/auth/confirm', '/auth/signout']) {
      expect(isPublic(path), path).toBe(true)
    }
  })

  it('protects everything the app actually holds', () => {
    for (const path of [
      '/', '/today', '/plan', '/progress', '/insights', '/playbook', '/profile',
      '/onboarding', '/api/ai/classify',
    ]) {
      expect(isPublic(path), path).toBe(false)
    }
  })

  it('is not fooled by a prefix that merely starts the same', () => {
    // Without the boundary check, `/loginsomething` would be public.
    expect(isPublic('/loginsomething')).toBe(false)
    expect(isPublic('/authoring')).toBe(false)
    expect(isPublic('/signups')).toBe(false)
  })
})
