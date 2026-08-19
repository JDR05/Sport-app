'use client'

import Link from 'next/link'
import { RequirePlan } from '@/components/RequirePlan'
import { Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'

export default function InsightsPage() {
  return (
    <RequirePlan>
      {() => (
        <Screen>
          <ScreenTitle title="Insights" subtitle="Was funktioniert bei dir – und was nicht?" />

          <SectionHeading>Muster</SectionHeading>
          <EmptyState
            title="Noch kein Muster erkannt"
            body="Eine einzelne Abweichung ist kein Muster. Die App wartet auf Wiederholung, bevor sie eine Hypothese aufstellt – lieber später etwas Belastbares als früh etwas Erfundenes."
            progress={{ done: 0, needed: 14, unit: 'Tagen' }}
          />

          <SectionHeading>Laufende Experimente</SectionHeading>
          <EmptyState
            title="Kein Experiment aktiv"
            body="Sobald ein Muster belegt ist, schlägt die App genau eine kleine Änderung vor, misst sie über einen festen Zeitraum und behält sie nur, wenn sie wirkt."
          />

          <SectionHeading>Dein Playbook</SectionHeading>
          <Link href="/playbook" className="block">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Persönliche Regeln</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Was die App über dich gelernt hat. Noch leer – hier entsteht der Teil, den ein
                    Chat nicht haben kann.
                  </p>
                </div>
                <span aria-hidden className="text-xl text-faint">
                  ›
                </span>
              </div>
            </Card>
          </Link>

          <Note>Mustererkennung und Experimente entstehen im übernächsten Entwicklungsschritt.</Note>
        </Screen>
      )}
    </RequirePlan>
  )
}
