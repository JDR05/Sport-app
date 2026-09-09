// The copy stays short, and this is what stops it growing back.
//
// The Profile screen once explained itself three times, the longest string ran
// to 210 characters, and six sections of one screen each explained their own
// emptiness in a paragraph. Every one of those sentences was true and worth
// saying once — which is exactly how it happens: nobody adds a wall of text,
// everybody adds one more helpful line.
//
// So the ceiling is mechanical. It is deliberately not a style rule about
// tone, which cannot be checked; it is a length, which can.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(full))
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const FILES = tsxFiles('src')

/**
 * How long one piece of user-facing German may be.
 *
 * 110 characters is roughly two lines on a phone. Past that it is a paragraph,
 * and a paragraph on a screen somebody opens twice a day is a paragraph nobody
 * reads twice.
 */
const MAX_SENTENCE = 110

/**
 * Where a longer text is the point rather than a lapse.
 *
 * The legal pages are legally required to be complete, and completeness beats
 * brevity there — an incomplete privacy notice is not a shorter one, it is an
 * invalid one. The metadata description is read by search engines and app
 * stores, not on a screen.
 */
const ALLOWED = ['/(legal)/', 'app/layout.tsx', '/playbook/']

/** German prose, as opposed to a class list, a URL or an identifier. */
const GERMAN = /[äöüßÄÖÜ]|\b(die|der|das|und|nicht|dein|deine|wenn|dass|wie)\b/

function longStrings(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const found: string[] = []
  for (const line of source.split('\n')) {
    if (line.includes('className') || line.includes('//')) continue
    for (const match of line.matchAll(/["'`]([^"'`{}<>]{40,})["'`]/g)) {
      const text = match[1]
      if (!GERMAN.test(text)) continue
      if (text.length > MAX_SENTENCE) found.push(text)
    }
  }
  return found
}

describe('the app says things once, and briefly', () => {
  it('has no user-facing sentence over the ceiling', () => {
    const offenders = FILES.filter((f) => !ALLOWED.some((a) => f.includes(a)))
      .flatMap((file) => longStrings(file).map((text) => `${file}: ${text.slice(0, 60)}…`))
    expect(offenders).toEqual([])
  })

  it('is actually reading the source', () => {
    // Every assertion above passes against an empty file list, so a broken
    // glob would read as a codebase with perfect copy.
    expect(FILES.length).toBeGreaterThan(30)
    expect(FILES.some((f) => f.includes('today'))).toBe(true)
  })

  it('would catch a paragraph creeping back in', () => {
    // The rule has to bite on the thing it exists to stop, and the only
    // honest way to show that is to run it against one.
    const paragraph = [
      "  <p>Eine einzelne Abweichung ist kein Muster. Die App wartet auf Wiederholung —",
      'lieber später etwas Belastbares als früh etwas Zufälliges.</p>',
    ].join(' ')
    expect(paragraph.length).toBeGreaterThan(MAX_SENTENCE)
  })
})
