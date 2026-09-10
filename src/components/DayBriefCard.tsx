'use client'

// The AI, at the top of the day.
//
// Everything else the model does in this app happens once per goal or once per
// week, which is why it read as absent: five sentences in four weeks, four of
// them before the first action was ever ticked off. This card is the one place
// it is present daily — and the one place it can change something rather than
// comment on it.
//
// Loaded from the client after the actions have rendered, like the impulse and
// for the same reason: writing a brief costs a model call, and Today is the
// screen where a wait was a bug once already (ADR-088). Nothing here holds the
// day up. The card appears when there is something, or never.
//
// It renders nothing at all on an ordinary day, and that is not a degraded
// state — a card that has something clever to say every single morning is a
// horoscope, and one filler sentence is enough for somebody to stop reading
// the next thirty.

import { useCallback, useEffect, useState } from 'react'
import { applyDayBrief, loadDayBrief } from '@/app/(app)/actions'
import { Button, Card } from '@/components/ui'
import type { DayBrief } from '@/lib/db/daily-brief'

export function DayBriefCard({
  today,
  /** Today's actions, so the focus can be shown as a title rather than an id. */
  items,
  /** Called after a change was applied, so the day on screen catches up. */
  onChanged,
}: {
  today: string
  items: Array<{ id: string; title: string }>
  onChanged: () => void
}) {
  const [brief, setBrief] = useState<DayBrief | null>(null)

  useEffect(() => {
    let current = true
    void loadDayBrief(today)
      .then((loaded) => {
        if (current) setBrief(loaded)
      })
      // A failed brief is no card. There is nothing useful to say to somebody
      // about the app's own inability to think of something to say.
      .catch(() => {
        if (current) setBrief(null)
      })
    return () => {
      current = false
    }
  }, [today])

  if (!brief) return null
  return (
    <DayBriefView
      brief={brief}
      items={items}
      onApply={async () => {
        const result = await applyDayBrief(today)
        if (result.ok) {
          setBrief(result.brief)
          onChanged()
        } else {
          // Stale means they answered the action between the card being drawn
          // and the tap. The suggestion is simply gone; nothing failed, and an
          // error message about it would be the app apologising for their
          // progress.
          setBrief((b) => (b ? { ...b, adjust: null } : b))
          if (result.reason === 'stale') onChanged()
        }
      }}
    />
  )
}

/** The card itself. Separate so it can be rendered in a test without a server. */
export function DayBriefView({
  brief,
  items,
  onApply,
}: {
  brief: DayBrief
  items: Array<{ id: string; title: string }>
  onApply: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const focus = items.find((i) => i.id === brief.focusItemId) ?? null

  const apply = useCallback(async () => {
    setBusy(true)
    try {
      await onApply()
    } finally {
      setBusy(false)
    }
  }, [onApply])

  return (
    <Card tone="accent">
      <p className="text-sm leading-relaxed text-ink">{brief.line}</p>

      {/* The whole of "was ist heute wichtig?", in one line. Three to five
          actions with no order between them is five things that are equally
          important, which is none. */}
      {focus && (
        <p className="mt-3 text-sm text-ink">
          <span className="label mr-2 text-[10px] font-semibold text-faint">Zuerst</span>
          {focus.title}
        </p>
      )}

      {brief.adjust && !brief.adjustAppliedAt && (
        <div className="mt-3 border-t border-accent/20 pt-3">
          <p className="text-sm leading-relaxed text-muted">{brief.adjust.reason}</p>
          <div className="mt-3">
            <Button variant="quiet" onClick={apply} disabled={busy}>
              {brief.adjust.label}
            </Button>
          </div>
        </div>
      )}

      {/* Said once the change is made, and said plainly. The app changed the
          day, so it says the day changed — this is the one place where a
          sentence in the past tense is true, and every other AI output in this
          product is forbidden from writing one. */}
      {brief.adjust && brief.adjustAppliedAt && (
        <p className="mt-3 border-t border-accent/20 pt-3 text-sm text-muted">
          Übernommen. Der Tag ist angepasst.
        </p>
      )}

      <p className="mt-3 text-xs text-faint">
        Aus deinen Daten · <span className="num">{brief.evidence.length}</span> Belege
      </p>
    </Card>
  )
}
