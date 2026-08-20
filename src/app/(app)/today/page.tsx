'use client'

import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { ActionItem } from '@/components/ActionItem'
import { CheckInCard } from '@/components/CheckInCard'
import { Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { formatGermanDate, weekdayOf } from '@/lib/engine/dates'

const WEEKDAY_LONG: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}

export default function TodayPage() {
  const { today, setStatus } = usePlan()

  return (
    <RequirePlan>
      {(week) => {
        const items = week.items.filter((i) => i.scheduledOn === today)
        const restToday = !items.some((i) => i.domain === 'training')

        return (
          <Screen>
            <ScreenTitle
              title={WEEKDAY_LONG[weekdayOf(today)]}
              subtitle={formatGermanDate(today)}
            />

            {/* What matters today, and why — the one thing every screen must answer. */}
            <Card tone="accent">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {week.strategy.goalTrack.archetype === 'general_health'
                  ? 'Deine Basis'
                  : 'Dein Ziel'}
              </p>
              <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
                {week.strategy.goalTrack.headline}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {week.rationale[0]?.text}
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
                {items.map((item) => (
                  <ActionItem
                    key={item.id}
                    item={item}
                    status={item.status}
                    onStatus={(status) => setStatus(item.id, status)}
                  />
                ))}
              </div>
            )}

            {restToday && items.length > 0 && (
              <Note>
                Heute steht kein Training an. Die Gesundheitsbasis läuft weiter — sie gehört zum
                Plan, nicht daneben.
              </Note>
            )}

            <Note>
              Nicht abgehakte Aktionen zählen als „unbekannt“ und fließen nie als Versagen in die
              Auswertung ein.
            </Note>

            <CheckInCard today={today} archetype={week.strategy.goalTrack.archetype} />
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
