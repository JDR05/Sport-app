// Three defects found by re-reading the seams built in one sitting.
//
// None of them showed up in a test run, a type check, a lint pass or a build.
// All three are the same species: code whose comment states an intent the code
// cannot deliver, which is the failure this codebase keeps producing and the
// reason each one gets an assertion rather than a fix and a promise.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const worker = readFileSync('public/sw.js', 'utf8')
/**
 * The worker with its comments stripped.
 *
 * The first version of the assertion below searched the whole file for
 * `addAll` and found it in the comment explaining why `addAll` was removed —
 * a rule that fails on its own documentation is a rule people delete. Code and
 * prose have to be told apart before either can be asserted about.
 */
const workerCode = worker.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const today = readFileSync('src/app/(app)/today/page.tsx', 'utf8')

describe('the offline shell is actually cached', () => {
  it('caches each route on its own, not all-or-nothing', () => {
    // `cache.addAll` rejects the whole list if any one response fails — and it
    // rejects outright on a redirect. '/plan' became a redirect when the tab
    // went away, so addAll rejected, the catch swallowed it, and the worker
    // installed holding nothing. Offline did nothing, silently, with no error
    // anywhere to notice.
    expect(workerCode).not.toMatch(/\baddAll\b/)
    expect(workerCode).toMatch(/SHELL\.map/)
  })

  it('lists no route that only redirects somewhere else', () => {
    const shell: string[] = JSON.parse(
      (worker.match(/const SHELL = (\[[^\]]*\])/) ?? [])[1].replace(/'/g, '"'),
    )
    const redirects = ['/plan', '/progress', '/insights']
    expect(shell.filter((path) => redirects.includes(path))).toEqual([])
  })

  it('caches the screens the app actually has', () => {
    expect(worker).toContain("'/today'")
    expect(worker).toContain("'/muster'")
    expect(worker).toContain("'/offline'")
  })
})

describe('the evening card does not read a clock during render', () => {
  it('never calls new Date() in the page body', () => {
    // A client component is still rendered on the server for the first HTML,
    // where the clock is UTC. Between 16:00 and 17:00 UTC the server said "not
    // evening" and a phone in Berlin said "evening" — a hydration mismatch on
    // the card whose whole job is to make answering cheap.
    expect(today).not.toMatch(/new Date\(\)\.getHours\(\)/)
  })

  it('takes the hour from the browser after mount', () => {
    expect(today).toContain('useLocalHour')
    // And renders nothing until the browser has answered, rather than guessing.
    expect(today).toMatch(/hour !== null/)
  })
})

describe('the round-up does not repeat what already has a card', () => {
  it('offers the day\'s actions, not the standing rules', () => {
    // Standing rules have their own card with their own ring. Listing them
    // again in the round-up put the same rule on one screen twice — the exact
    // duplication this screen was rebuilt to remove.
    expect(today).toMatch(/const open = items\.filter/)
    expect(today).not.toMatch(/const open = all\.filter/)
  })
})
