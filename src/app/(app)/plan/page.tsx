'use client'

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { Card, DomainBadge, Note, Screen, ScreenTitle, SectionHeading, Reasoning } from '@/components/ui'
import { addDays, formatGermanDate } from '@/lib/engine/dates'
import { WEEKDAYS } from '@/lib/domain/types'

const WEEKDAY_LONG: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export default function PlanPage() {
  const { today } = usePlan()

  return (
    <RequirePlan>
      {(plan) => (
        <Screen>
          <ScreenTitle
            title="Diese Woche"
            subtitle={`Ab ${formatGermanDate(plan.strategy.weekStart)}`}
          />

          <Card tone="accent">
            <p className="text-sm font-semibold text-ink">Die Strategie dahinter</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li>
                {plan.strategy.trainingSessions}× Training à {plan.strategy.sessionMinutes} Min
              </li>
              <li>{plan.strategy.targetIntakeKcal} kcal pro Tag</li>
              <li>{plan.strategy.restWeekdays.length} Ruhetage</li>
            </ul>
          </Card>

          {WEEKDAYS.map((weekday, index) => {
            const date = addDays(plan.strategy.weekStart, index)
            const items = plan.items.filter((i) => i.scheduledOn === date)
            const isToday = date === today

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
                    {items.map((item) => (
                      <div
                        key={`${date}-${item.title}`}
                        className={`rounded-xl border p-3 ${
                          isToday ? 'border-accent/40 bg-surface' : 'border-line bg-surface'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-ink">{item.title}</p>
                          <DomainBadge domain={item.domain} />
                        </div>
                        <Reasoning>{item.rationale.text}</Reasoning>
                      </div>
                    ))}
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
      )}
    </RequirePlan>
  )
}
