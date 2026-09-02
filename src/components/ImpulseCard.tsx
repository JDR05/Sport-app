'use client'

// The impulse, on the day it arrives.
//
// It used to live only on Insights and only on Thursdays. Both halves of that
// were wrong. The screen people open is Today, so an impulse on Insights is a
// message left where the person is not; and Thursday is a calendar, not an
// occasion — somebody giving the same reason three times on Monday and Tuesday
// waited two days for a reply, by which point the week was decided.
//
// Now the check runs whenever the app is opened, and an impulse appears here
// on the day it was written. The next day it is gone from Today and lives on
// Insights, which is what makes it an event rather than a banner. No "seen"
// flag: the date it was written already says everything a flag would.
//
// Loaded from the client, after the actions have rendered, because writing one
// costs a model call — and Today is the one screen in this app where a wait
// was already a bug once (ADR-088). Nothing here holds anything up: the card
// appears when it has something, or never.

import { useEffect, useState } from 'react'
import { loadTodaysImpulse } from '@/app/(app)/actions'
import { Card, SectionHeading } from '@/components/ui'
import { TRIGGER_LABELS } from '@/lib/adaptive/labels'
import type { WeeklyNote } from '@/lib/db/weekly-note'

export function ImpulseCard({ today }: { today: string }) {
  const [impulse, setImpulse] = useState<WeeklyNote | null>(null)

  useEffect(() => {
    let current = true
    void loadTodaysImpulse(today)
      .then((loaded) => {
        if (current) setImpulse(loaded)
      })
      // Nothing to say about a failed check on a screen whose job is today's
      // three actions.
      .catch(() => {
        if (current) setImpulse(null)
      })
    return () => {
      current = false
    }
  }, [today])

  if (!impulse) return null
  return <ImpulseView impulse={impulse} />
}

/** The card itself. Separate so it can be rendered in a test. */
export function ImpulseView({ impulse }: { impulse: WeeklyNote }) {
  return (
    <>
      {/* The heading names the occasion rather than the week. An impulse that
          arrived because of three „Zu müde" taps, filed under "Diese Woche",
          is the app hiding its own reasoning — the same rule every rationale
          in this product lives under. */}
      <SectionHeading>{TRIGGER_LABELS[impulse.trigger] ?? 'Diese Woche'}</SectionHeading>
      <Card tone="accent">
        <p className="text-sm leading-relaxed text-ink">{impulse.observation}</p>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-ink">{impulse.suggestion}</p>
        {impulse.question && (
          <p className="mt-3 border-t border-accent/20 pt-3 text-sm leading-relaxed text-muted">
            {impulse.question}
          </p>
        )}
        <p className="mt-3 text-xs text-faint">
          Aus deinen Daten · <span className="num">{impulse.evidence.length}</span> Belege
        </p>
      </Card>
    </>
  )
}
