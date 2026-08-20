'use client'

import { RequirePlan } from '@/components/RequirePlan'
import { MetricEntry, type MetricSpec } from '@/components/MetricEntry'
import { Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading, StatTile } from '@/components/ui'
import { formatGermanDate } from '@/lib/engine/dates'
import { ANALYSIS_WEEKS } from '@/lib/adaptive/constants'

export type ProgressData = {
  spec: MetricSpec | null
  history: Array<{ value: number; measuredAt: string }>
  completion: number | null
  completionThisWeek: number | null
  weeksWithData: number
  resolvedCount: number
}

export function ProgressView({ data }: { data: ProgressData }) {
  return (
    <RequirePlan>
      {(plan) => {
        const s = plan.strategy
        return (
          <Screen>
            <ScreenTitle title="Fortschritt" subtitle="Wo stehst du, und was hält dich zurück?" />

            <Card tone="accent">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Deine Zielspur
              </p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{s.goalTrack.headline}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {s.goalTrack.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatTile
                label="Zieldatum"
                value={s.targetDate ? formatGermanDate(s.targetDate).replace(/ \d{4}$/, '') : 'offen'}
                hint={s.targetDateAdjusted ? 'angepasst' : 'wie gewünscht'}
              />
              <StatTile
                label="Aktionen"
                value={`${plan.items.filter((i) => i.track === 'goal').length}`}
                hint="fürs Ziel diese Woche"
              />
            </div>

            {data.spec ? (
              <>
                <SectionHeading>{data.spec.label}</SectionHeading>
                <MetricEntry spec={data.spec} history={data.history} />
              </>
            ) : (
              <>
                <SectionHeading>Zielmetrik</SectionHeading>
                <Card>
                  <p className="text-sm font-semibold text-ink">Dieses Ziel hat keine Zahl</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Nicht jedes Ziel lässt sich messen, und das ist in Ordnung. Bewertet wird
                    hier dein Verhalten, nicht ein Wert auf einer Waage.
                  </p>
                </Card>
              </>
            )}

            <SectionHeading>Konsistenz</SectionHeading>
            {data.completion === null ? (
              <EmptyState
                title="Noch nichts abgehakt"
                body="Sobald du Aktionen als erledigt oder nicht geschafft markierst, steht hier, wie viel vom Plan tatsächlich passiert ist. Nicht angetippte Aktionen zählen nie als Versäumnis."
                progress={{ done: data.weeksWithData, needed: 2, unit: 'Wochen' }}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="Diese Woche"
                  value={
                    data.completionThisWeek === null
                      ? '–'
                      : `${Math.round(data.completionThisWeek * 100)} %`
                  }
                  hint="umgesetzt"
                />
                <StatTile
                  label={`Letzte ${ANALYSIS_WEEKS} Wochen`}
                  value={`${Math.round(data.completion * 100)} %`}
                  hint={`aus ${data.resolvedCount} Aktionen`}
                />
              </div>
            )}

            <Note>
              Gezählt wird nur, was du selbst bewertet hast. Ein Tag ohne Eintrag ist fehlende
              Information, kein Versäumnis — er senkt diese Quote nicht.
            </Note>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
