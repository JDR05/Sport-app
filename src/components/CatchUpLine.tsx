'use client'

// One line about the days the app has no answers for.
//
// Deliberately not a card. A card is an object you act on, and this is a
// remark — the day's own work is what the cards on this screen are for. It also
// has to be able to disappear completely, and a card that is sometimes there
// and sometimes not is a layout that jumps; a line is just a line.
//
// The wording and the boundaries live in domain/openDays.ts, where they can be
// tested. What is here is only how it looks.

export function CatchUpLine({
  sentence,
  onGo,
}: {
  /** Null when there is nothing open, which is the common case and draws nothing. */
  sentence: string | null
  onGo: () => void
}) {
  if (!sentence) return null

  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-3">
      <p className="text-sm leading-snug text-muted">{sentence}</p>
      {/* "Eintragen", not "Nachholen". The first is what the tap does; the
          second is a verdict about what did not happen. */}
      <button
        type="button"
        onClick={onGo}
        className="label min-h-11 shrink-0 rounded-control border border-line-strong bg-surface px-3 text-[11px] font-semibold text-ink transition-colors duration-[var(--motion-tap)] active:bg-sunken"
      >
        Eintragen
      </button>
    </div>
  )
}
