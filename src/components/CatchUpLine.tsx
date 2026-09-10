'use client'

// One line about the days the app has no answers for.
//
// Deliberately not a card. A card is an object you act on, and this is a
// remark — the day's own work is what the cards on this screen are for. It also
// has to be able to disappear completely, and a card that is sometimes there
// and sometimes not is a layout that jumps; a line is just a line.
//
// It loads its own count rather than reading the week already on screen, and
// that changed after the first version. Heute holds exactly one week, so a line
// built from it said "Von Montag und Dienstag" while five days were open — the
// two it could see. A sentence that under-reports because of where it happens
// to be rendered is worse than no sentence: it tells somebody they are nearly
// caught up when they are not.
//
// The wording and the boundaries live in domain/openDays.ts, where they can be
// tested. What is here is how it looks and where it goes.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadCatchUpDays } from '@/app/(app)/actions'
import { openDaysSentence } from '@/lib/domain/openDays'

export function CatchUpLine({ today }: { today: string }) {
  const [days, setDays] = useState<string[]>([])

  useEffect(() => {
    let current = true
    void loadCatchUpDays(today)
      .then((loaded) => {
        if (current) setDays(loaded.map((d) => d.date))
      })
      // A failed load means no line. There is nothing useful to say to somebody
      // about the app's own difficulty counting its gaps.
      .catch(() => {
        if (current) setDays([])
      })
    return () => {
      current = false
    }
  }, [today])

  const sentence = openDaysSentence(days)
  if (!sentence) return null

  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-3">
      <p className="text-sm leading-snug text-muted">{sentence}</p>
      {/* "Eintragen", not "Nachholen". The first is what the tap does; the
          second is a verdict about what did not happen. */}
      <Link
        href="/nachtragen"
        className="label flex min-h-11 shrink-0 items-center rounded-control border border-line-strong bg-surface px-3 text-[11px] font-semibold text-ink transition-colors duration-[var(--motion-tap)] active:bg-sunken"
      >
        Eintragen
      </Link>
    </div>
  )
}
