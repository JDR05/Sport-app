// The reminder, and the rules around it.
//
// Reminders are the largest single lever on whether this app is used: the
// check-in is where the behaviour model gets its data, and somebody who does
// not think of the app in the evening records nothing. They are also the
// easiest place to break the brief's no-guilt rule, and the one place where a
// scheduled server job reads across everybody — which is what RLS exists to
// prevent.
//
// The database half is verified against the hosted project (see ADR-118). What
// is testable here is the shape of the payload and the pure decisions around
// it.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const worker = readFileSync('public/sw.js', 'utf8')
const cron = readFileSync('vercel.json', 'utf8')

describe('the service worker never caches somebody’s data', () => {
  it('only handles GET navigations', () => {
    // The rule that keeps health data out of the Cache API — not by filtering
    // it carefully, but by never seeing it. Everything that carries data is a
    // fetch to Supabase, and those are not navigations.
    expect(worker).toContain("request.method !== 'GET'")
    expect(worker).toContain("request.mode !== 'navigate'")
  })

  it('caches only same-origin successful responses', () => {
    // An opaque or errored response cached here is a broken screen served
    // confidently for as long as the cache lives.
    expect(worker).toContain("response.ok && response.type === 'basic'")
  })

  it('tries the network before the cache', () => {
    // Cache-first would show yesterday's app to somebody who is online. The
    // cache is a fallback, never the source.
    const fetchFirst = worker.indexOf('fetch(request)')
    const cacheFallback = worker.indexOf('caches.match(request)')
    expect(fetchFirst).toBeGreaterThan(0)
    expect(fetchFirst).toBeLessThan(cacheFallback)
  })
})

describe('the reminder does not nag', () => {
  it('replaces the previous notification instead of stacking', () => {
    // Without a tag, three evenings away produce three stacked notifications —
    // which is the guilt mechanic the brief rules out, arriving by push.
    expect(worker).toContain("tag: 'trace-reminder'")
    expect(worker).toContain('renotify: false')
  })

  it('says nothing about performance in the notification itself', () => {
    // A notification is read on a lock screen by somebody who may have had a
    // bad week. It asks a question; it never reports a score.
    for (const forbidden of ['verpasst', 'Serie', 'Streak', 'geschafft', '%']) {
      expect(worker, forbidden).not.toContain(forbidden)
    }
  })

  it('opens a window it already has rather than a second one', () => {
    expect(worker).toContain('clients.matchAll')
  })
})

describe('the cached shell is dropped when a deployment changes', () => {
  // The cache key was the literal 'trace-shell-v1' and never moved. The
  // activate handler deletes every cache whose key is not the current one —
  // with a constant key it could delete nothing, ever, so a phone kept the
  // shell of whatever deployment it first met. The comment above that handler
  // claimed the opposite, which is the shape of defect this project keeps
  // finding: intent in the prose, the reverse in the code.

  it('takes its cache key from the script URL, not from a constant', () => {
    expect(worker).toMatch(/self\.location\.search/)
    expect(worker).not.toMatch(/const VERSION = ['\`]trace-shell-v\d+['\`]/)
  })

  it('still deletes every cache that is not the current one', () => {
    expect(worker).toMatch(/caches\.delete/)
    expect(worker).toMatch(/!==\s*VERSION/)
  })

  it('is registered with a version the deployment sets', () => {
    const registration = readFileSync('src/components/ServiceWorker.tsx', 'utf8')
    expect(registration).toMatch(/sw\.js\?v=/)
    expect(registration).toContain('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA')
  })
})

describe('the schedule', () => {
  // This test used to assert an hourly schedule, and it was right about the
  // design and wrong about the platform. The hour belongs to the person —
  // somebody in Berlin who chose 20:00 and somebody in Lisbon who chose 20:00
  // are an hour apart, and both mean their own evening — so hourly is what
  // this wants. The Hobby plan caps cron at once a day and *rejects the whole
  // vercel.json* otherwise, which is not a failed build but no deployment at
  // all. Five days of pushes went nowhere behind that.
  //
  // So the assertion is now the compromise rather than the wish, and the wish
  // is written down beside it instead of being enforced against reality.

  it('points at the sending route', () => {
    expect(JSON.parse(cron).crons[0].path).toBe('/api/reminders')
  })

  it('runs at a fixed hour, which is all the current plan allows', () => {
    const [minute, hour] = JSON.parse(cron).crons[0].schedule.split(' ')
    expect(minute).not.toBe('*')
    expect(hour).not.toBe('*')
  })

  it('still decides who is due by their own local hour', () => {
    // The degradation is in how often the job runs, never in what it does when
    // it runs. If this ever compares against a server hour instead, a daily
    // schedule stops being a reduced feature and becomes a wrong one.
    const migration = readFileSync(
      'supabase/migrations/20260904160000_push_subscriptions.sql',
      'utf8',
    )
    expect(migration).toContain('now() at time zone s.time_zone')
    expect(migration).toContain('= s.remind_hour')
  })

  it('says out loud that hourly is what it wants', () => {
    // A limitation nobody wrote down is one somebody re-discovers as a bug.
    const route = readFileSync('src/app/api/reminders/route.ts', 'utf8')
    expect(route).toMatch(/Hobby|hourly/)
  })
})

describe('the sending route holds no service key', () => {
  const route = readFileSync('src/app/api/reminders/route.ts', 'utf8')

  it('uses the publishable key, not the service role one', () => {
    // ADR-034 keeps the service key out of the deployment: a key that bypasses
    // RLS bypasses the whole security model the moment it leaks. The elevated
    // read lives in a database function that requires this deployment's secret
    // and returns no health data.
    expect(route).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    expect(route).not.toMatch(/SERVICE_ROLE|SUPABASE_SECRET/)
  })

  it('refuses without the shared secret', () => {
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain('401')
  })

  it('drops a subscription the browser has thrown away', () => {
    // 404 and 410 mean the app was uninstalled or permission revoked. Keeping
    // the row retries it hourly for ever.
    expect(route).toContain('status === 404 || status === 410')
  })
})
