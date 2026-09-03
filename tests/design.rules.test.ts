// The design rules, checked over the whole source rather than one screen.
//
// DESIGN_SYSTEM.md says the pill was removed "damit die Rundung nicht leise
// zurückkommt" — the rule exists because an interface drifts back into the
// look it came from, one component at a time, and each step looks reasonable
// on its own. A rule nothing checks is a preference, and a review found four
// violations that had crept in exactly that way.
//
// Source-level rather than rendered, because rendering every screen would need
// a browser and a database; a class name in a file is checkable everywhere.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every source file, walked rather than globbed so the Node version cannot matter. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

const FILES = [...sourceFiles('src'), 'src/app/globals.css']

/** file:line for every line matching, so a failure names the place. */
function offenders(pattern: RegExp, allow: (file: string, line: string) => boolean = () => false) {
  const found: string[] = []
  for (const file of FILES) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line) && !allow(file, line)) found.push(`${file}:${i + 1}  ${line.trim()}`)
      })
  }
  return found
}

describe('two radii, no pill', () => {
  it('uses no Tailwind radius scale anywhere', () => {
    // The scale is what drifts: rounded-md on a skeleton, rounded-lg on a
    // button, and the app is soft again without anyone deciding it should be.
    expect(offenders(/\brounded-(sm|md|lg|xl|2xl|3xl)\b/)).toEqual([])
  })

  it('uses rounded-full only for the rings the design system names', () => {
    // "Ein erledigter Ring" is explicitly sanctioned. Everything else is a
    // pill, and the pill is gone.
    //
    // Two files, not one, and the second is a deliberate extension rather than
    // a leak: the pull-to-refresh indicator is the same ring doing the same
    // job — a circle that fills to say how far along something is. Adding it
    // to this list is the decision being written down; the rule still fails on
    // the next `rounded-full` that is really a pill.
    const RINGS = ['CheckRing.tsx', 'PullToRefresh.tsx']
    expect(
      offenders(/\brounded-full\b/, (file) => RINGS.some((ring) => file.endsWith(ring))),
    ).toEqual([])
  })
})

describe('two typefaces with separate jobs', () => {
  it('sets small caps in the mono, not in the prose face', () => {
    // Barlow speaks, IBM Plex Mono measures. An uppercase eyebrow is a tag,
    // which the design system assigns to the mono — and two identical-looking
    // roles rendering in two typefaces on the same screen is the drift this
    // rule exists to stop.
    expect(offenders(/\buppercase\b.*\btracking-wide\b/)).toEqual([])
  })
})

describe('no shadows and no hard-coded colours', () => {
  it('uses hairlines, not shadows', () => {
    expect(offenders(/\bshadow-(sm|md|lg|xl|2xl)\b/)).toEqual([])
  })

  it('takes every colour from a token', () => {
    // Hex belongs in globals.css, in the theme-colour meta tag, and in the
    // icon. Anywhere else it is a colour that will not follow the theme.
    expect(
      offenders(
        /#[0-9a-fA-F]{3,8}\b/,
        (file) => file.endsWith('globals.css') || file.endsWith('layout.tsx') || file.includes('Logo'),
      ),
    ).toEqual([])
  })
})

describe('the control test', () => {
  it('is actually reading the source', () => {
    // Every assertion above passes against an empty file list. Without this,
    // a broken glob would read as a clean codebase.
    expect(FILES.length).toBeGreaterThan(40)
    expect(offenders(/\brounded-\[3px\]/).length).toBeGreaterThan(3)
  })
})
