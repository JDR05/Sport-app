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
import { DAYS_TO_FIRST_RULE } from '@/lib/adaptive/constants'
import type { LearnedRule } from '@/lib/db/experiments'

/**
 * A rule as a sentence about this person, not as a key-value pair.
 *
 * The wording matters more than it looks. The same finding can read as "you
 * fail on Wednesdays" or "Wednesday does not work for you" — and only the
 * second one is a statement about a plan rather than a verdict on a person.
 */
const WEEKDAY: Record<string, string> = {
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag',
  fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
}
const SLOT: Record<string, string> = {
  early: 'morgens', midday: 'mittags', evening: 'abends',
}
const DOMAIN: Record<string, string> = {
  training: 'Training', nutrition: 'Ernährung', movement: 'Bewegung',
  sleep: 'Schlaf', self_improvement: 'Routine', priority: 'Fokus',
}

function describe(rule: LearnedRule): string {
  const v = rule.ruleValue
  switch (rule.ruleKey) {
    case 'avoid_weekday':
      return `${WEEKDAY[String(v.weekday)] ?? 'Dieser Tag'} passt bei dir nicht. Der Plan nutzt ihn nicht mehr für Einheiten.`
    case 'prefer_time_slot':
      return `Du setzt Aktionen ${SLOT[String(v.slot)] ?? 'zu dieser Zeit'} zuverlässiger um. Der Plan legt sie dorthin, wenn der Tag es hergibt.`
    case 'shorter_sessions':
      return `Kürzere Einheiten funktionieren bei dir besser. Der Plan bleibt unter ${String(v.maxMinutes)} Minuten.`
    case 'lighter_domain':
      return `Der Bereich ${DOMAIN[String(v.domain)] ?? 'dieser Bereich'} war in dieser Menge zu viel. Er läuft kleiner weiter, statt zu verschwinden.`
    default:
      return 'Eine gelernte Regel, die diese Version der App noch nicht in Worte fasst.'
  }
}

export function PlaybookView({
  rules,
  daysWithData,
}: {
  rules: LearnedRule[]
  /** Days on which at least one action was actually answered. */
  daysWithData: number
}) {
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

          {rules.length > 0 ? (
            <div className="flex flex-col gap-3">
              {rules.map((rule) => (
                <Card key={rule.ruleKey}>
                  <p className="text-sm leading-relaxed text-ink">{describe(rule)}</p>
                  <p className="mt-2 text-xs text-faint">
                    Aus einem abgeschlossenen Experiment. Sicherheit{' '}
                    <span className="num">{Math.round(rule.confidence * 100)}</span> % — sie kann wieder sinken, wenn es
                    später anders läuft.
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            <>
              {/* The number was hardcoded at zero against a hardcoded 21, so
                  the bar never moved and the target was invented. Both halves
                  are real now: days on which something was actually answered,
                  counted towards the earliest a rule can exist — two weeks for
                  detection plus the fortnight the experiment then runs. */}
              <EmptyState
                title="Noch keine Regel bestätigt"
                body="Eine Regel entsteht erst, wenn ein Experiment sie belegt hat – nicht aus einer einzelnen guten Woche. Jede Regel hier trägt später ihren Beleg."
                progress={{
                  done: Math.min(daysWithData, DAYS_TO_FIRST_RULE),
                  needed: DAYS_TO_FIRST_RULE,
                  unit: 'Tagen mit Daten',
                }}
              />
            </>
          )}

          {rules.length === 0 && (
            <>
              <SectionHeading>So sieht eine Regel später aus</SectionHeading>
              <Card>
                <p className="text-sm font-semibold text-ink">
                  Donnerstag ist für dich zuverlässiger als Mittwoch
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Erfüllungsquote von 20 % auf 80 %, bestätigt über drei Wochen.
                </p>
                <p className="label mt-2 text-[10px] text-faint">
                  Beispiel
                </p>
              </Card>
            </>
          )}

          <Note>
            Nach zwölf Wochen steht hier nicht nur eine Zahl auf der Waage, sondern eine Sammlung
            von Strategien, die für dich belegt funktionieren.
          </Note>
        </Screen>
      )}
    </RequirePlan>
  )
}
