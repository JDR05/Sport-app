'use client'

import { usePlan, itemKey } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { ActionItem } from '@/components/ActionItem'
import { Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { formatGermanDate, weekdayOf } from '@/lib/engine/dates'

const WEEKDAY_LONG: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export default function TodayPage() {
  const { today, statuses, setStatus } = usePlan()

  return (
    <RequirePlan>
      {(plan) => {
        const items = plan.items.filter((i) => i.scheduledOn === today)
        const restToday = plan.strategy.restWeekdays.includes(weekdayOf(today))

        return (
          <Screen>
            <ScreenTitle
              title={WEEKDAY_LONG[weekdayOf(today)]}
              subtitle={formatGermanDate(today)}
            />

            {/* What matters today, and why — the one thing every screen must answer. */}
            <Card tone="accent">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Dein Ziel
              </p>
              <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
                {plan.strategy.targetIntakeKcal} kcal · {plan.strategy.trainingSessions}× Training
                diese Woche
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {plan.rationale[plan.rationale.length - 1]?.text}
              </p>
            </Card>

            <SectionHeading>
              {items.length > 0 ? `Heute · ${items.length} Aktionen` : 'Heute'}
            </SectionHeading>

            {items.length === 0 ? (
              <Card>
                <p className="text-sm font-semibold text-ink">Heute steht nichts an.</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Das ist kein Versäumnis, sondern geplant. Ruhetage gehören zum Plan.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item) => {
                  const key = itemKey(item.scheduledOn, item.title)
                  return (
                    <ActionItem
                      key={key}
                      item={item}
                      status={statuses[key] ?? 'unknown'}
                      onStatus={(status) => setStatus(key, status)}
                    />
                  )
                })}
              </div>
            )}

            {restToday && items.some((i) => i.domain !== 'training') && (
              <Note>
                Heute ist ein Ruhetag vom Training. Bewegung und Ernährung laufen weiter.
              </Note>
            )}

            <Note>
              Nicht abgehakte Aktionen zählen als „unbekannt“ und fließen nie als Versagen in die
              Auswertung ein.
            </Note>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
