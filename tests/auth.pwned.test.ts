// The parts of the leak check that must be right regardless of the network.
//
// The hash prefix is the privacy guarantee: five characters go out, the rest
// never leaves the process. If that split were wrong — a longer prefix, or the
// full hash by accident — the check would quietly become a way of handing
// people's passwords to a third party. So it is pinned to a known value.

import { describe, expect, it } from 'vitest'
import { countInRange, hashParts } from '@/lib/auth/pwned'

describe('hashParts', () => {
  it('splits the SHA-1 after exactly five characters', () => {
    // 'password' → 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8, the most famous
    // leaked hash there is. Pinned so a change to the split is impossible to
    // make by accident.
    const { prefix, suffix } = hashParts('password')
    expect(prefix).toBe('5BAA6')
    expect(suffix).toBe('1E4C9B93F3F0682250B6CF8331B7EE68FD8')
    expect(prefix).toHaveLength(5)
    expect(prefix + suffix).toHaveLength(40)
  })

  it('never puts the password itself anywhere near the request', () => {
    const secret = 'sehr-geheimes-passwort-123'
    const { prefix, suffix } = hashParts(secret)
    expect(prefix).not.toContain(secret)
    expect(suffix).not.toContain(secret)
    expect(/^[0-9A-F]{5}$/.test(prefix)).toBe(true)
  })

  it('handles umlauts and emoji without changing length', () => {
    for (const password of ['Käsebrötchen-Süß', 'passwort🔒mit-emoji', '  spaces  ']) {
      const { prefix, suffix } = hashParts(password)
      expect(prefix + suffix).toHaveLength(40)
    }
  })
})

describe('countInRange', () => {
  const body = [
    '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365',
    '0018A45C4D1DEF81644B54AB7F969B88D65:1',
    'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0',
  ].join('\r\n')

  it('finds a leaked suffix and its count', () => {
    expect(countInRange(body, '1E4C9B93F3F0682250B6CF8331B7EE68FD8')).toBe(9659365)
    expect(countInRange(body, '0018A45C4D1DEF81644B54AB7F969B88D65')).toBe(1)
  })

  it('reports zero for a suffix that is not there', () => {
    expect(countInRange(body, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(0)
  })

  it('treats a padding entry as not leaked', () => {
    // Padding rows carry a count of 0 and exist only to hide the real response
    // size. Counting one as a hit would reject a perfectly good password.
    expect(countInRange(body, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(0)
  })

  it('survives a malformed or empty body', () => {
    for (const junk of ['', '\n\n', 'nonsense', 'ABC:not-a-number']) {
      expect(() => countInRange(junk, 'ABC')).not.toThrow()
    }
    expect(countInRange('ABC:not-a-number', 'ABC')).toBe(0)
  })
})
