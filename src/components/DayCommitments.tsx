'use client'

// The part of the day the app did not plan.
//
// Today used to look empty on the evening somebody has football. The engine
// knew about it — `sportDays` is why no second session is planned there — but
// the screen showed nothing, so the biggest thing in that person's week was
// invisible in the app that is supposed to be about their week. "Ich hab
// nichts über mein Training drin, und es ist ja trotzdem ein essentieller
// Anteil."
//
// Deliberately not a plan item and deliberately not tickable. The app did not
// choose it and cannot judge it: missing your own football is not the plan
// failing, and letting it into the completion counts would put something the
// app never decided into the evidence it learns from. So it is shown as what
// it is — a fixed point the plan is built around.

import type { Commitment, Weekday } from '@/lib/domain/types'

const KIND_LABEL: Record<Commitment['kind'], string> = {
  sport: 'Sport',
  work: 'Arbeit',
  study: 'Uni/Schule',
  care: 'Familie',
  other: 'Termin',
}

/** The commitments on one weekday, earliest first. */
export function commitmentsForDay(commitments: Commitment[], weekday: Weekday): Commitment[] {
  return commitments
    .filter((c) => c.weekday === weekday)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function DayCommitments({
  commitments,
  weekday,
  notes,
}: {
  commitments: Commitment[]
  weekday: Weekday
  /**
   * What the model judged this training to be worth for this goal, by label.
   *
   * The reason this card is worth more than a calendar entry. Absent for an
   * account with no model, and then the card is what it was before — the
   * appointment, and why nothing is planned on top of it.
   */
  notes?: Record<string, string>
}) {
  const today = commitmentsForDay(commitments, weekday)
  if (today.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {today.map((commitment) => (
        <article
          key={`${commitment.weekday}-${commitment.start}-${commitment.label}`}
          className="relative overflow-hidden rounded-[3px] border border-dashed border-line bg-sunken/40 p-3.5 pl-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug text-ink">
                {commitment.label}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="label rounded-[2px] border border-line px-1.5 py-px text-[10px] font-semibold text-muted">
                  {KIND_LABEL[commitment.kind]}
                </span>
                <span className="num text-[11px] text-faint">
                  {commitment.start} · {commitment.minutes} min
                </span>
              </div>
            </div>
          </div>

          {/* What this particular training is worth for this particular goal,
              and how to get the most out of it.
              
              Above the standing line on purpose: it is the sentence somebody
              actually reads, and it is the one a lookup table could never
              produce. "Fußball hält deine Grundlagenausdauer hoch, ersetzt
              aber kein Krafttraining für die Beine" is about them; "Sport"
              is a category. */}
          {notes?.[commitment.label] && (
            <p className="mt-2 text-sm leading-relaxed text-ink">{notes[commitment.label]}</p>
          )}

          {/* Why it is here without a ring next to it. Without this line the
              card reads as an action somebody forgot to tick. */}
          <p className="mt-2 text-xs leading-relaxed text-faint">
            {commitment.kind === 'sport'
              ? 'Dein fester Termin. Deshalb plant die App hier kein zusätzliches Training.'
              : 'Dein fester Termin. Die App plant um diese Zeit herum.'}
          </p>
        </article>
      ))}
    </div>
  )
}

/** Named export used by the week view, where space is tighter. */
export function CommitmentLine({
  commitment,
  note,
}: {
  commitment: Commitment
  note?: string
}) {
  return (
    <div className="rounded-[2px] border border-dashed border-line bg-sunken/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">{commitment.label}</p>
        <span className="num shrink-0 text-[11px] text-faint">{commitment.start}</span>
      </div>
      <p className="mt-1 text-xs text-faint">
        {KIND_LABEL[commitment.kind]} · <span className="num">{commitment.minutes}</span> min ·
        dein Termin
      </p>
      {note && <p className="mt-1.5 text-sm leading-relaxed text-muted">{note}</p>}
    </div>
  )
}
