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

describe('the schedule', () => {
  it('runs hourly, because the hour belongs to the person', () => {
    // Somebody in Berlin who chose 20:00 and somebody in Lisbon who chose
    // 20:00 are an hour apart, and both mean their own evening. A daily job
    // could only ever be right for one time zone.
    expect(JSON.parse(cron).crons[0].schedule).toBe('0 * * * *')
    expect(JSON.parse(cron).crons[0].path).toBe('/api/reminders')
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
