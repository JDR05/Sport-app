// vercel.json, checked before it can stop a deployment.
//
// This file silently broke every deploy of this project for five days. A cron
// object carried a "comment" key, Vercel's schema allows only `path` and
// `schedule`, and an invalid vercel.json is not a failed build — it is *no
// deployment at all*. Nothing appears in the deployment list, no email, no red
// cross. Eight commits went to GitHub with green CI while the running app
// stayed five days old, and the only visible symptom was a person saying "on
// my phone nothing happens".
//
// That is the worst shape a defect can have: it is invisible in every place
// somebody would look. So it gets a test, and the test runs in the same CI
// that was cheerfully green throughout.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  regions?: string[]
  crons?: Array<Record<string, unknown>>
}

describe('vercel.json is something Vercel will accept', () => {
  it('gives every cron exactly the keys the schema allows', () => {
    // The whole defect, in one assertion. `$schema` is editor tooling and does
    // not run anywhere; this is the check that actually happens before a push.
    for (const cron of config.crons ?? []) {
      expect(Object.keys(cron).sort()).toEqual(['path', 'schedule'])
    }
  })

  it('keeps every cron within what the Hobby plan runs', () => {
    // Hobby caps cron jobs at once a day. An hourly schedule is rejected, and
    // rejected here means the same silence as above.
    for (const cron of config.crons ?? []) {
      const [minute, hour] = String(cron.schedule).split(' ')
      expect(minute).not.toBe('*')
      expect(hour).not.toBe('*')
      expect(hour).not.toMatch(/\*\//)
    }
  })

  it('points every cron at a route that exists', () => {
    for (const cron of config.crons ?? []) {
      const path = String(cron.path).replace(/^\//, '')
      expect(() => readFileSync(`src/app/${path}/route.ts`, 'utf8')).not.toThrow()
    }
  })

  it('still runs next to its database', () => {
    // Deleted by accident in the same commit that broke the crons: the whole
    // file was rewritten rather than edited, and "Run the app in Frankfurt,
    // next to its database" went with it.
    expect(config.regions).toEqual(['fra1'])
  })
})
