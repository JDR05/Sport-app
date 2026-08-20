'use client'

import Link from 'next/link'
import { RequirePlan } from '@/components/RequirePlan'
import { MetricEntry, type MetricSpec } from '@/components/MetricEntry'
import { ScoreRing } from '@/components/ScoreRing'
import { DOMAIN_LABEL, Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading, StatTile } from '@/components/ui'
import { formatGermanDate } from '@/lib/engine/dates'
import { ANALYSIS_WEEKS } from '@/lib/adaptive/constants'
import type { WeekScores } from '@/lib/adaptive/scores'

export type ProgressData = {
  spec: MetricSpec | null
  history: Array<{ value: number; measuredAt: string }>
  completion: number | null
  completionThisWeek: number | null
  weeksWithData: number
  resolvedCount: number
  scores: WeekScores
}

export function ProgressView({ data }: { data: ProgressData }) {
  return (
    <RequirePlan>
      {(plan) => {
        const s = plan.strategy
        return (
          <Screen>
            <ScreenTitle title="Fortschritt" subtitle="Wo stehst du, und was hält dich zurück?" />

            {data.scores.overall.planned === 0 ? (
              <EmptyState
                title="Diese Woche ist noch nichts geplant"
                body="Sobald dein Wochenplan steht, zeigt der Ring, wie viel davon tatsächlich passiert ist."
              />
            ) : (
              <Card>
                <div className="flex items-center gap-5">
                  <ScoreRing
                    rate={data.scores.overall.rate}
                    size={96}
                    label="Gesamt"
                    detail={
                      data.scores.overall.resolved === 0
                        ? 'noch nichts bewertet'
                        : `${data.scores.overall.done} von ${data.scores.overall.resolved} bewertet`
                    }
                  />
                  {/* Naming a gap without offering a way to close it is worse
                      than not naming it, so the sentence links to where the
                      week can actually be answered. */}
                  <div className="text-sm leading-relaxed text-muted">
                    {data.scores.overall.rate === null ? (
                      <p>
                        Hak Aktionen ab, dann füllt sich der Ring. Ein Tag ohne Eintrag zählt
                        nie dagegen.
                      </p>
                    ) : data.scores.overall.untouched > 0 ? (
                      <p>
                        {data.scores.overall.untouched} Aktionen dieser Woche hast du nicht
                        bewertet. Die zählen nicht mit — weder dafür noch dagegen.{' '}
                        <Link href="/plan" className="text-accent underline underline-offset-4">
                          Im Wochenplan nachtragen
                        </Link>
                      </p>
                    ) : (
                      <p>Alles bewertet. Der Ring zeigt genau das, was passiert ist.</p>
                    )}
                  </div>
                </div>

                {data.scores.domains.length > 1 && (
                  <div className="mt-5 flex flex-wrap justify-around gap-4 border-t border-line pt-4">
                    {data.scores.domains.map((d) => (
                      <ScoreRing
                        key={d.domain}
                        rate={d.rate}
                        domain={d.domain}
                        label={DOMAIN_LABEL[d.domain]}
                        detail={d.resolved === 0 ? 'offen' : `${d.done}/${d.resolved}`}
                      />
                    ))}
                  </div>
                )}
              </Card>
            )}


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
              Information, kein Versäumnis — er senkt keine dieser Zahlen.
            </Note>

            <SectionHeading>Alles Weitere</SectionHeading>
            <Link href="/profile" className="block">
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Deine Angaben</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      Alles, was du erzählt hast — auch die Werte, die für dieses Ziel gerade
                      keine Rolle spielen. Nichts davon ist weg, es steht nur nicht im Weg.
                    </p>
                  </div>
                  <span aria-hidden className="text-xl text-faint">›</span>
                </div>
              </Card>
            </Link>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}
