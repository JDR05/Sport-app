// Sending the day's reminders. Called by a scheduler, hourly.
//
// Hourly rather than once a day because the hour is the *person's* — somebody
// in Berlin who picked 20:00 and somebody in Lisbon who picked 20:00 are an
// hour apart, and both mean their own eight in the evening. The database
// decides who is due, in their own zone; this route only sends.
//
// It holds no service key. ADR-034 keeps that out of the deployment, and a
// scheduled route is not an exception to it: reading across everybody happens
// inside `due_reminders`, a database function that requires this deployment's
// secret and returns an endpoint and its keys — no name, no goal, no health
// data of any kind. Even with the secret, this path cannot read anything about
// anybody.

import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Never prerendered, never cached: it has a side effect and a secret.
export const dynamic = 'force-dynamic'

/** One line, and deliberately not about the person's data. */
const REMINDER = {
  title: 'Trace',
  body: 'Wie lief dein Tag?',
  url: '/today',
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!secret || !publicKey || !privateKey || !subject) {
    // Not configured is not an error the scheduler should retry.
    return NextResponse.json({ sent: 0, reason: 'not_configured' }, { status: 200 })
  }

  // The scheduler proves it is the scheduler. Compared with the same care the
  // database uses: a length-safe comparison, so the header cannot be probed.
  const offered = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!timingSafeEqual(offered, secret)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  // The anonymous key, on purpose. Everything elevated is inside the two
  // functions below, and both require the secret above.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase.rpc('due_reminders', { secret })
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })

  const due = (data ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>
  let sent = 0
  let gone = 0

  for (const row of due) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(REMINDER),
      )
      // Marked immediately rather than in a batch at the end: a crash halfway
      // through must not resend to everybody already reminded.
      await supabase.rpc('mark_reminder_sent', { secret, target: row.endpoint })
      sent++
    } catch (pushError) {
      // 404 and 410 mean the browser threw the subscription away — the app was
      // uninstalled, or permission was revoked. Keeping the row would retry it
      // hourly for ever, so it goes.
      const status = (pushError as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
        gone++
      }
    }
  }

  return NextResponse.json({ due: due.length, sent, gone })
}

/** Constant time for equal-length input, and never leaks the length either. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still does the work, so a wrong length is not faster than a wrong value.
    let sink = 0
    for (let i = 0; i < b.length; i++) sink |= b.charCodeAt(i)
    return sink < 0
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
