'use client'

import { useCallback, useState } from 'react'
import { setItemStatus } from '@/app/(app)/actions'
import { Card, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { CATCH_UP_DAYS } from '@/lib/domain/openDays'
import type { CatchUpDay } from '@/lib/db/catch-up'
import type { PlanItemStatus } from '@/lib/domain/types'

export function CatchUpView({ days }: { days: CatchUpDay[] }) {
  // Answered rows stay in place rather than disappearing. A list that shortens
  // under the thumb makes the next row jump into the spot you were aiming at,
  // and this screen is a column of small targets.
  const [answered, setAnswered] = useState<Record<string, PlanItemStatus>>({})

  const answer = useCallback((id: string, status: PlanItemStatus) => {
    setAnswered((prev) => ({ ...prev, [id]: status }))
    // Optimistic, like every other verdict in this app, and rolled back the
    // same way when the write reports that it changed nothing.
    void setItemStatus(id, status)
      .then((result) => {
        if (!result.ok) setAnswered((prev) => withoutKey(prev, id))
      })
      .catch(() => setAnswered((prev) => withoutKey(prev, id)))
  }, [])

  if (days.length === 0) {
    return (
      <Screen>
        <ScreenTitle title="Nachtragen" subtitle="Alles beantwortet." />
        <Card>
          <p className="text-sm leading-relaxed text-muted">
            Von den letzten <span className="num">{CATCH_UP_DAYS}</span> Tagen weiß die App
            alles, was sie wissen kann.
          </p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenTitle
        title="Nachtragen"
        // Says what it is for, in one line, and says the boundary out loud.
        // Somebody who remembers a session three weeks ago and cannot find it
        // here should learn why rather than assume the app lost it.
        subtitle={`Was offen ist, aus den letzten ${CATCH_UP_DAYS} Tagen. Ältestes zuerst.`}
      />

      {days.map((day) => (
        <section key={day.date}>
          {/* The date next to the weekday, because "Montag" two weeks back and
              "Montag" last week are the same word and not the same day. */}
          <SectionHeading>
            {day.weekday} · <span className="num">{day.formatted}</span>
          </SectionHeading>
          <Card>
            <ul className="flex flex-col">
              {day.items.map((item, index) => {
                const given = answered[item.id]
                return (
                  <li
                    key={item.id}
                    className={`flex items-center gap-3 py-2.5 ${
                      index > 0 ? 'border-t border-line' : ''
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 text-sm leading-snug ${
                        given ? 'text-faint line-through' : 'text-ink'
                      }`}
                    >
                      {item.title}
                    </span>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => answer(item.id, 'done')}
                        aria-pressed={given === 'done'}
                        aria-label={`${item.title} am ${day.formatted} als erledigt markieren`}
                        className={`h-10 w-10 rounded-control border text-base ${
                          given === 'done'
                            ? 'border-accent bg-accent text-white'
                            : 'border-line-strong text-muted'
                        }`}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => answer(item.id, 'missed')}
                        aria-pressed={given === 'missed'}
                        aria-label={`${item.title} am ${day.formatted} als nicht geschafft markieren`}
                        className={`h-10 w-10 rounded-control border text-base ${
                          given === 'missed'
                            ? 'border-warn bg-warn text-white'
                            : 'border-line-strong text-muted'
                        }`}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      ))}

      {/* The permission to stop, said once at the bottom.

          Without it this is a list of things somebody owes the app, which is
          the second job the rules forbid — and it would also be the worse
          outcome for the data: a row guessed at to clear the list is worse than
          the gap it fills, because nothing downstream can tell the two apart. */}
      <p className="mt-6 text-sm leading-relaxed text-muted">
        Was du nicht mehr weißt, lass offen. Geraten ist schlechter als leer.
      </p>
    </Screen>
  )
}

/** The optimistic value put back, when the write reports it changed nothing. */
function withoutKey(
  record: Record<string, PlanItemStatus>,
  key: string,
): Record<string, PlanItemStatus> {
  const rest = { ...record }
  delete rest[key]
  return rest
}
