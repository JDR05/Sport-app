// Can the text actually be read?
//
// The design system commits to a lot of grey on white and one signal colour.
// That is the instrument look the brief asks for, and it is also the shortest
// path to text nobody over forty can read on a phone in daylight — the
// difference between the two is a number, and the number had never been
// measured.
//
// WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text (18.66px bold or 24px)
// and for the boundary of a control somebody has to find. Whether the BFSG
// applies to this operator is a legal question in PRODUCTION_READINESS.md;
// whether the app is readable is not, and it is the reason to do this either
// way.
//
// Every pair below is one that actually occurs in the app, in both themes.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/** The token values, read from the stylesheet so this cannot drift from it. */
function palette(): Record<string, { light: string; dark: string }> {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const out: Record<string, { light: string; dark: string }> = {}
  const pattern = /--([a-z-]+):\s*light-dark\((#[0-9a-fA-F]{3,8}),\s*(#[0-9a-fA-F]{3,8})\)/g

  for (const [, name, light, dark] of css.matchAll(pattern)) {
    out[name] = { light, dark }
  }
  return out
}

function channel(hex: string, from: number): number {
  const v = parseInt(hex.slice(from, from + 2), 16) / 255
  // The sRGB transfer function, not a straight average: perceived lightness is
  // not linear, and a naive version passes pairs a person cannot read.
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const h = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  return 0.2126 * channel(h, 1) + 0.7152 * channel(h, 3) + 0.0722 * channel(h, 5)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const P = palette()

/** Every pair the app actually renders, with the ratio each one must clear. */
const PAIRS: Array<{ what: string; fg: string; bg: string; min: number }> = [
  // Body text. 4.5:1.
  { what: 'ink on paper', fg: 'ink', bg: 'paper', min: 4.5 },
  { what: 'ink on surface', fg: 'ink', bg: 'surface', min: 4.5 },
  { what: 'ink on sunken', fg: 'ink', bg: 'surface-sunken', min: 4.5 },
  { what: 'muted on paper', fg: 'ink-muted', bg: 'paper', min: 4.5 },
  { what: 'muted on surface', fg: 'ink-muted', bg: 'surface', min: 4.5 },
  { what: 'muted on sunken', fg: 'ink-muted', bg: 'surface-sunken', min: 4.5 },
  { what: 'accent on paper', fg: 'accent', bg: 'paper', min: 4.5 },
  { what: 'accent on surface', fg: 'accent', bg: 'surface', min: 4.5 },
  { what: 'accent-ink on accent', fg: 'accent-ink', bg: 'accent', min: 4.5 },
  { what: 'ink on accent-soft', fg: 'ink', bg: 'accent-soft', min: 4.5 },

  // `faint` carries only small non-essential labels — dates, counters, the
  // "3 offen" badge. Still text, still 4.5:1: "decorative" is what a designer
  // calls a label, not what somebody looking for it calls it.
  { what: 'faint on paper', fg: 'ink-faint', bg: 'paper', min: 4.5 },
  { what: 'faint on surface', fg: 'ink-faint', bg: 'surface', min: 4.5 },
]

describe('text can be read', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const pair of PAIRS) {
      it(`${theme}: ${pair.what}`, () => {
        const fg = P[pair.fg]?.[theme]
        const bg = P[pair.bg]?.[theme]
        expect(fg, `token --${pair.fg} not found`).toBeTruthy()
        expect(bg, `token --${pair.bg} not found`).toBeTruthy()

        const ratio = contrast(fg, bg)
        expect(
          Number(ratio.toFixed(2)),
          `${pair.what} in ${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${pair.min}:1`,
        ).toBeGreaterThanOrEqual(pair.min)
      })
    }
  }
})

describe('a control can be found', () => {
  // WCAG 1.4.11 asks 3:1 for the boundary of a control that has to be located,
  // and this app draws its quiet buttons entirely with a border — so that
  // border is the button. `--line` cannot serve both jobs: at 3:1 the hairline
  // separation everywhere else would stop being a hairline, which is the whole
  // instrument look. Hence two tokens, tested against different thresholds.
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: a control border can be seen`, () => {
      for (const bg of ['paper', 'surface', 'surface-sunken'] as const) {
        const ratio = contrast(P['line-strong'][theme], P[bg][theme])
        expect(
          Number(ratio.toFixed(2)),
          `line-strong on ${bg} in ${theme} is ${ratio.toFixed(2)}:1, needs 3:1`,
        ).toBeGreaterThanOrEqual(3)
      }
    })

    it(`${theme}: the decorative hairline stays a hairline`, () => {
      // The other direction, and it is deliberate. 1.4.11 exempts a boundary
      // that is not needed to identify the component — a card is identified by
      // the text inside it. If this ever climbed to 3:1 somebody would have
      // quietly turned every card into a box, so the rule guards both edges.
      const ratio = contrast(P.line[theme], P.surface[theme])
      expect(Number(ratio.toFixed(2))).toBeLessThan(3)
    })
  }
})
