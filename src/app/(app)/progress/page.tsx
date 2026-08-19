'use client'

import { RequirePlan } from '@/components/RequirePlan'
import { Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading, StatTile } from '@/components/ui'
import { formatGermanDate } from '@/lib/engine/dates'

export default function ProgressPage() {
  return (
    <RequirePlan>
      {(plan) => {
        const s = plan.strategy
        return (
          <Screen>
            <ScreenTitle title="Fortschritt" subtitle="Wo stehst du, und was hält dich zurück?" />

            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Zieldatum" value={formatGermanDate(s.targetDate).replace(/ \d{4}$/, '')} hint={s.targetDateAdjusted ? 'angepasst' : 'wie gewünscht'} />
              <StatTile label="Tempo" value={`${s.ratePerWeekKg} kg`} hint="pro Woche" />
              <StatTile label="Tagesziel" value={`${s.targetIntakeKcal}`} hint="kcal" />
              <StatTile label="Defizit" value={`−${s.deficitKcal}`} hint={s.deficitTier === 'mild' ? 'mild' : 'moderat'} />
            </div>

            <SectionHeading>Gewichtsverlauf</SectionHeading>
            <EmptyState
              title="Noch keine Messung"
              body="Sobald du dein Gewicht mehrmals erfasst hast, zeigt die App hier den Trend – als gleitenden Mittelwert, nicht als Tageswert. Einzelne Tage schwanken um ein bis zwei Kilo und sagen nichts aus."
            />

            <SectionHeading>Konsistenz</SectionHeading>
            <EmptyState
              title="Noch keine Woche ausgewertet"
              body="Die Wochenauswertung vergleicht Plan und Realität. Dafür braucht die App eine vollständige Woche mit Check-ins."
              progress={{ done: 0, needed: 7, unit: 'Tagen' }}
            />

            <Card>
              <p className="text-sm font-semibold text-ink">Warum hier nichts steht</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Die App erfindet keine Trends aus einem einzigen Datenpunkt. Fehlende Daten sind
                kein Versagen – sie sind einfach noch nicht da.
              </p>
            </Card>

            <Note>Erfassung von Gewicht und Check-ins kommt im nächsten Entwicklungsschritt.</Note>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
