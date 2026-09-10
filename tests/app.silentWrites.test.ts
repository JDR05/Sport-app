// A write that does nothing must not report success.
//
// The symptom was "es speichert alles nicht": every tap looked recorded and
// every verdict was gone on the next load. Nothing in the request log — the
// action returned 200 — nothing in the build, nothing in two thousand tests.
//
// Two pieces of code conspired, and both were doing what their comment said
// they were not.
//
//   * `setItemStatus` returned `{ ok: error === null }`. An update matching no
//     rows is not an error in Postgres; it is a successful statement that
//     changed nothing. So "no error" was read as "written".
//   * The provider rolled the optimistic value back on `{ ok: false }` but had
//     no `catch`, so a *rejected* action — offline, expired session, a 500 —
//     skipped the rollback entirely and left the screen claiming success. Its
//     comment promised "the screen never claims something was recorded that
//     was not".

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const actions = readFileSync('src/app/(app)/actions.ts', 'utf8')
const provider = readFileSync('src/components/PlanProvider.tsx', 'utf8')

/** Code with comments stripped, so a rule cannot pass or fail on its own prose. */
const code = (source: string) =>
  source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('the database decides whether a write happened', () => {
  it('never treats "no error" alone as "written"', () => {
    expect(code(actions)).not.toMatch(/ok:\s*error === null/)
  })

  it('asks for the row back and requires exactly one', () => {
    expect(code(actions)).toMatch(/\.select\('id'\)/)
    expect(code(actions)).toMatch(/length === 1/)
  })

  it('reports a write that matched nothing', () => {
    // A 200 that changed nothing is invisible everywhere else.
    expect(code(actions)).toMatch(/reportServerError/)
  })
})

describe('the optimistic value is put back on every kind of failure', () => {
  it('rolls back when the action reports failure', () => {
    expect(code(provider)).toMatch(/if \(!result\.ok\) rollBack\(\)/)
  })

  it('rolls back when the action rejects', () => {
    // The case that was missing: `.then` alone never runs for a rejection.
    expect(code(provider)).toMatch(/\.catch\(rollBack\)/)
  })

  it('uses one rollback for both, so they cannot drift apart', () => {
    expect((code(provider).match(/const rollBack = \(\)/g) ?? []).length).toBe(1)
  })
})
