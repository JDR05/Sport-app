'use client'

// The week, and the only place a past day can still be answered.
//
// Today shows today. That was fine until the rings on Progress started saying
// "19 Aktionen hast du nicht bewertet" about a week whose earlier days had no
// screen left that could reach them — the number named a gap and then offered
// no way to close it, which is worse than not showing it.
//
// So every day up to and including today carries the same control as Today.
// Later days stay read-only: an action that has not happened yet cannot have
// been missed, and offering the choice would invite an answer that means
// nothing.

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { ActionItem } from '@/components/ActionItem'
import { Card, DomainBadge, Note, Screen, ScreenTitle, SectionHeading, Reasoning } from '@/components/ui'
import { addDays, formatGermanDate } from '@/lib/engine/dates'
import { WEEKDAYS } from '@/lib/domain/types'

const WEEKDAY_LONG: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export default function PlanPage() {
  const { today, setStatus, answer, accept } = usePlan()

  return (
    <RequirePlan>
      {(plan) => {
        const open = plan.items.filter(
          (i) => i.scheduledOn <= (today ?? '') && (i.status === 'unknown' || i.status === 'planned'),
        ).length

        return (
          <Screen>
            <ScreenTitle
              title="Diese Woche"
              subtitle={`Ab ${formatGermanDate(plan.strategy.weekStart)}`}
            />

            <Card tone="accent">
              <p className="text-sm font-semibold text-ink">{plan.strategy.goalTrack.headline}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {plan.strategy.goalTrack.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>

            {open > 0 && (
              <Note>
                {open === 1
                  ? 'Eine Aktion aus dieser Woche ist noch offen. Du kannst sie hier nachtragen.'
                  : `${open} Aktionen aus dieser Woche sind noch offen. Du kannst sie hier nachtragen — auch für vergangene Tage.`}
              </Note>
            )}

            {WEEKDAYS.map((weekday, index) => {
              const date = addDays(plan.strategy.weekStart, index)
              const items = plan.items.filter((i) => i.scheduledOn === date)
              const isToday = date === today
              // No `today` yet means the client's date has not arrived. Treat
              // the week as unanswerable rather than guessing which days passed.
              const answerable = today !== null && date <= today

              return (
                <section key={weekday}>
                  <SectionHeading>
                    {WEEKDAY_LONG[weekday]}
                    {isToday && <span className="ml-2 text-accent">heute</span>}
                  </SectionHeading>

                  {items.length === 0 ? (
                    <p className="text-sm text-faint">Ruhetag</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {items.map((item) =>
                        answerable ? (
                          <ActionItem
                            key={item.id}
                            item={item}
                            status={item.status}
                            onStatus={(status) => setStatus(item.id, status)}
                            onAnswer={(status, reason, note) =>
                              answer(item.id, status, reason, note)
                            }
                            onAccept={() => accept(item.id)}
                          />
                        ) : (
                          <div key={item.id} className="rounded-[2px] border border-line bg-surface p-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium text-ink">{item.title}</p>
                              <DomainBadge domain={item.domain} track={item.track} />
                            </div>
                            <Reasoning>{item.rationale.text}</Reasoning>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </section>
              )
            })}

            <Note>
              Der Plan ist eine Start-Hypothese, kein Urteil. Er verändert sich, sobald die App sieht,
              was bei dir tatsächlich funktioniert.
            </Note>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
