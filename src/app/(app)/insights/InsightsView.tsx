'use client'

// What the app has noticed, and what it is careful not to claim.
//
// Most of the time this screen says nothing, and that is the design. A single
// deviation is not a pattern; two rough days in one week are not a pattern. The
// thresholds live in the adaptive engine and are deliberately hard to reach —
// so the honest state of this screen, for the first couple of weeks, is empty.
//
// When it does speak, every statement carries the actions it was derived from.
// A recommendation that cannot point at its evidence must not exist.

import Link from 'next/link'
import { Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { MIN_DISTINCT_WEEKS } from '@/lib/adaptive/constants'
import type { Insight } from '@/lib/adaptive'

export type InsightsData = {
  insights: Insight[]
  experiment: {
    hypothesis: string
    changeDescription: string
    endDate: string
    evidenceCount: number
  } | null
  patchNotes: string[]
  moveCount: number
  removalCount: number
  weeksWithData: number
}

export function InsightsView({ data }: { data: InsightsData }) {
  return (
    <Screen>
      <ScreenTitle title="Insights" subtitle="Was funktioniert bei dir – und was nicht?" />

      <SectionHeading>Muster</SectionHeading>
      {data.insights.length === 0 ? (
        <EmptyState
          title="Noch kein Muster erkannt"
          body="Eine einzelne Abweichung ist kein Muster. Die App wartet, bis sich etwas über mehrere Wochen wiederholt — lieber später etwas Belastbares als früh etwas Erfundenes."
          progress={{ done: data.weeksWithData, needed: MIN_DISTINCT_WEEKS, unit: 'Wochen' }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.insights.map((insight, index) => (
            <Card key={index}>
              <p className="text-sm leading-relaxed text-ink">{insight.statement}</p>
              <p className="mt-2 text-xs text-faint">
                Beruht auf {insight.evidence.length}{' '}
                {insight.evidence.length === 1 ? 'Aktion' : 'Aktionen'} aus deinem Plan.
              </p>
            </Card>
          ))}
        </div>
      )}

      <SectionHeading>Laufende Experimente</SectionHeading>
      {data.experiment === null ? (
        <EmptyState
          title="Kein Experiment aktiv"
          body="Sobald ein Muster belegt ist, schlägt die App genau eine kleine Änderung vor, misst sie über einen festen Zeitraum und behält sie nur, wenn sie wirkt."
        />
      ) : (
        <Card tone="accent">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Vorschlag</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
            {data.experiment.hypothesis}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {data.experiment.changeDescription}
          </p>
          <p className="mt-2 text-xs text-faint">
            Ausgewertet wird an deiner Umsetzungsquote, nie an einem Zielwert. Belegt durch{' '}
            {data.experiment.evidenceCount} Aktionen.
          </p>
        </Card>
      )}

      {(data.moveCount > 0 || data.removalCount > 0) && (
        <>
          <SectionHeading>Kleine Korrekturen</SectionHeading>
          <Card>
            <p className="text-sm leading-relaxed text-ink">
              {data.moveCount > 0 && `${data.moveCount} Aktion${data.moveCount === 1 ? '' : 'en'} könnten an einem anderen Tag besser passen. `}
              {data.removalCount > 0 && `${data.removalCount} Aktion${data.removalCount === 1 ? '' : 'en'} passt nicht zu deinem Alltag und fällt raus.`}
            </p>
            {data.patchNotes.map((note) => (
              <p key={note} className="mt-2 text-xs text-faint">
                {note}
              </p>
            ))}
          </Card>
        </>
      )}

      <SectionHeading>Dein Playbook</SectionHeading>
      <Link href="/playbook" className="block">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Persönliche Regeln</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Was die App über dich gelernt hat. Nur bestätigte Experimente landen hier.
              </p>
            </div>
            <span aria-hidden className="text-xl text-faint">
              ›
            </span>
          </div>
        </Card>
      </Link>

      <Note>
        Ein Vorschlag entsteht erst, wenn sich eine Abweichung über mindestens{' '}
        {MIN_DISTINCT_WEEKS} verschiedene Wochen zieht und deutlich vom Rest abweicht. Tage ohne
        Eintrag zählen nie als Versäumnis.
      </Note>
    </Screen>
  )
}
