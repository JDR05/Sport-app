'use client'

// One planned action.
//
// The shape of this card is the answer to two complaints at once. It used to
// show four status buttons across two wrapped rows plus a "Warum?" disclosure —
// so a day with three actions was a wall of twelve buttons and three
// paragraphs, and the thing people actually do five times a day, marking
// something done, took the same effort as the things they almost never do.
//
// Now the common case is one tap on the ring. Everything else — moved, missed,
// did not fit, and the reasoning — lives behind one disclosure, present but not
// in the way. Nothing is hidden from the person; it is just not all shouting.
//
// The second half of the card is newer and is the reason to open the app on a
// Tuesday. Saying "nicht geschafft" used to be a dead end: the status was
// stored and the app said nothing, then guessed at the reason days later from
// weekdays and time slots. Now it asks — one question, tappable, no typing —
// and then does something visible about the answer. What it does is worked out
// on the server, because it changes a plan.
//
// Four statuses, not three, and that has not changed: `missed` and
// `not_relevant` mean different things to the adaptive engine — one is a
// behavioural signal, the other a planning error — and the user is the only one
// who can tell them apart. Untouched items stay `unknown` and never feed
// pattern detection (ADR-011).

import { useState } from 'react'
import { CheckRing } from '@/components/CheckRing'
import { DomainBadge } from '@/components/ui'
import { WEEKDAY_LABELS } from '@/lib/adaptive/labels'
import { asksForReason, REASON_LABELS, STATUS_REASONS } from '@/lib/adaptive/reaction'
import type { Reaction, StatusReason } from '@/lib/adaptive/reaction'
import { weekdayOf } from '@/lib/engine/dates'
import type { PlannedItem, PlanItemStatus } from '@/lib/domain/types'

/**
 * Every answer, including the one people actually give.
 *
 * `done` used to be missing here, because it lives on the ring. That left the
 * disclosure showing three ways to say it did not happen and no way to say it
 * did — you opened the list of answers and the answer you wanted was not in
 * it. The ring stays the fast path for the common case; this is the complete
 * set, and a set with a hole in it is worse than no set at all.
 */
const ANSWERS: Array<{ status: PlanItemStatus; label: string }> = [
  { status: 'done', label: 'Erledigt' },
  { status: 'moved', label: 'Verschoben' },
  { status: 'missed', label: 'Nicht geschafft' },
  { status: 'not_relevant', label: 'Passte nicht' },
]

export function ActionItem({
  item,
  status,
  onStatus,
  onAnswer,
  onAccept,
}: {
  item: PlannedItem
  status: PlanItemStatus
  onStatus: (status: PlanItemStatus) => void
  /**
   * Optional on purpose. Without it the card behaves exactly as before — which
   * is what the standing-rules list wants: "Eiweiß zu jeder Mahlzeit" is not
   * something that can be moved to Saturday.
   */
  onAnswer?: (
    status: PlanItemStatus,
    reason: StatusReason,
    note: string | null,
  ) => Promise<Reaction | null>
  onAccept?: () => Promise<Reaction | null>
}) {
  const [open, setOpen] = useState(false)
  const settled = status !== 'planned' && status !== 'unknown'

  // The status a reason is being asked for. Null means no question is open —
  // either none was asked, or it has been answered.
  const [asking, setAsking] = useState<PlanItemStatus | null>(null)
  const [offer, setOffer] = useState<Reaction | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Anything that changes the verdict retires the question and the offer. */
  function answered(next: PlanItemStatus) {
    onStatus(next)
    setOffer(null)
    setDone(null)
    setAsking(onAnswer && asksForReason(next) ? next : null)
  }

  async function give(reason: StatusReason) {
    if (!onAnswer || !asking || busy) return
    setBusy(true)
    const reaction = await onAnswer(asking, reason, null)
    setBusy(false)
    setAsking(null)
    // A null means the round trip failed. Saying nothing is better than
    // inventing an offer the server never made.
    if (reaction) setOffer(reaction)
  }

  async function take() {
    if (!onAccept || busy) return
    setBusy(true)
    const applied = await onAccept()
    setBusy(false)
    setOffer(null)
    setDone(applied ? confirmationFor(applied) : 'Das hat gerade nicht geklappt.')
  }

  return (
    <article
      className={`relative overflow-hidden rounded-[3px] border border-line bg-surface pl-1 transition-opacity ${
        settled ? 'opacity-60' : ''
      }`}
    >
      {/* The mark, on every action.
          
          The logo is two strokes of unequal height: the health baseline that
          runs under every goal, and the goal track on top of it. Here that
          same pair becomes the left edge of the card, and it carries real
          information rather than decorating — a full bar in the live colour is
          a goal action, a short muted one is the baseline. So the thing the
          product is actually about is legible at a glance on every screen, and
          the identity is the information rather than a badge stuck beside it. */}
      <span
        aria-hidden
        className={`absolute bottom-0 left-0 w-1 ${
          item.track === 'goal' ? 'top-0 bg-accent' : 'h-2/5 bg-ink/25'
        }`}
      />

      <div className="flex items-start gap-3 p-3.5">
        <CheckRing
          status={status}
          label={item.title}
          onToggle={() => answered(status === 'done' ? 'unknown' : 'done')}
        />

        <div className="min-w-0 flex-1 pt-1">
          <h3
            className={`text-[15px] font-semibold leading-snug text-ink ${
              status === 'done' ? 'line-through decoration-1' : ''
            }`}
          >
            {item.title}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <DomainBadge domain={item.domain} />
            {item.plannedDurationMin && (
              // Measured, so it is set in the mono like every other number the
              // app is willing to be held to.
              <span className="num text-[11px] text-faint">{item.plannedDurationMin} min</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Weniger zeigen' : 'Warum, und alle Antworten'}
          className="-m-2 shrink-0 p-2 text-faint"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
            className={`transition-transform duration-[var(--motion-enter)] ${open ? 'rotate-180' : ''}`}
          >
            <path
              d="M5 8l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-3.5 pb-3.5 pt-3">
          <p className="text-sm leading-relaxed text-muted">{item.rationale.text}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ANSWERS.map((option) => (
              <button
                key={option.status}
                type="button"
                aria-pressed={status === option.status}
                onClick={() => answered(status === option.status ? 'unknown' : option.status)}
                className={`label rounded-[2px] border min-h-11 px-3 py-2 text-[11px] font-semibold transition-colors duration-[var(--motion-tap)] ${
                  status === option.status
                    ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                    : 'border-line bg-surface text-muted active:bg-sunken'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* One question, and only after there is something to explain.
              
              No free-text field: this appears on a phone, in the evening,
              about something that already did not happen. A tap is the most
              anybody will give, so a tap has to be enough. */}
          {asking && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[13px] leading-snug text-muted">Woran lag&apos;s?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    disabled={busy}
                    onClick={() => void give(reason)}
                    className="label min-h-11 rounded-[2px] border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted transition-colors duration-[var(--motion-tap)] active:bg-sunken disabled:opacity-50"
                  >
                    {REASON_LABELS[reason]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* What the app proposes to do about it — and, when it proposes
              nothing, why not. `none` is shown with the same weight as the
              others: an app that only speaks up when it has a fix is an app
              that will invent one. */}
          {offer && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-sm leading-relaxed text-ink">{offer.message}</p>
              {offer.kind !== 'none' && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void take()}
                    className="label min-h-11 rounded-[2px] border border-accent bg-accent px-3 py-2 text-[11px] font-semibold text-[color:var(--accent-ink)] transition-colors duration-[var(--motion-tap)] disabled:opacity-50"
                  >
                    Passt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOffer(null)
                      setDone('Alles klar — bleibt, wie es war.')
                    }}
                    className="label min-h-11 rounded-[2px] border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted transition-colors duration-[var(--motion-tap)] active:bg-sunken disabled:opacity-50"
                  >
                    Lieber nicht
                  </button>
                </div>
              )}
            </div>
          )}

          {done && (
            <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted">
              {done}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

/** What actually happened, in the past tense, said once. */
function confirmationFor(applied: Reaction): string {
  if (applied.kind === 'move') {
    return `Verschoben. Steht jetzt am ${WEEKDAY_LABELS[weekdayOf(applied.toDate)]}.`
  }
  if (applied.kind === 'shorten') return `Gekürzt auf ${applied.toMinutes} Minuten.`
  return applied.message
}
