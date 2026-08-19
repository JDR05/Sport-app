'use client'

// The playbook.
//
// Deliberately visible from day one, and deliberately empty at the start with a
// progress bar towards the first rule. The difference between this product and a
// chat is persistence plus feedback — invisible by nature. A visibly growing
// artefact is what makes that difference believable. See critique K3.

import Link from 'next/link'
import { RequirePlan } from '@/components/RequirePlan'
import { Card, EmptyState, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'

export default function PlaybookPage() {
  return (
    <RequirePlan>
      {() => (
        <Screen>
          <Link href="/insights" className="mb-3 inline-block text-sm font-medium text-muted">
            ‹ Insights
          </Link>
          <ScreenTitle
            title="Dein Playbook"
            subtitle="Bestätigte Regeln darüber, was bei dir funktioniert"
          />

          <EmptyState
            title="Noch keine Regel bestätigt"
            body="Eine Regel entsteht erst, wenn ein Experiment sie belegt hat – nicht aus einer Vermutung und nicht aus einer einzelnen guten Woche. Jede Regel hier trägt später ihren Beleg."
            progress={{ done: 0, needed: 21, unit: 'Tagen mit Daten' }}
          />

          <SectionHeading>So sieht eine Regel später aus</SectionHeading>
          <Card>
            <p className="text-sm font-semibold text-ink">
              Donnerstag ist für dich zuverlässiger als Mittwoch
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Erfüllungsquote von 20 % auf 80 %, bestätigt über drei Wochen.
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-faint">Beispiel</p>
          </Card>

          <Note>
            Nach zwölf Wochen steht hier nicht nur eine Zahl auf der Waage, sondern eine Sammlung
            von Strategien, die für dich belegt funktionieren.
          </Note>
        </Screen>
      )}
    </RequirePlan>
  )
}
