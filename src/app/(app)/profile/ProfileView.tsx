'use client'

import { useRouter } from 'next/navigation'
import { RequirePlan } from '@/components/RequirePlan'
import { SignOutButton } from '@/components/SignOutButton'
import { ThemeSetting } from '@/components/ThemeSetting'
import { Button, Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { AiConsent, type ConsentView } from '@/components/AiConsent'

import type { GoalArchetype } from '@/lib/domain/types'
import type { StoredPlanInput } from '@/lib/db/plan-input'
import type { Theme } from '@/lib/theme'

const ARCHETYPE_LABEL: Record<GoalArchetype, string> = {
  body_composition: 'Körper und Gewicht',
  strength: 'Kraft und Muskelaufbau',
  endurance: 'Ausdauer',
  sleep_recovery: 'Schlaf und Erholung',
  nutrition_quality: 'Ernährungsqualität',
  habit_routine: 'Gewohnheit und Routine',
  general_health: 'Allgemeine Gesundheit',
}

const WORK_PATTERN: Record<string, string> = {
  student: 'Studium', office: 'Büro', remote: 'Homeoffice',
  shift: 'Schicht', irregular: 'Unregelmäßig',
}

export function ProfileView({
  answers,
  theme,
  provider,
  consent,
}: {
  answers: StoredPlanInput
  theme: Theme
  provider: string | null
  consent: ConsentView
}) {
  const router = useRouter()

  return (
    <RequirePlan>
      {(week) => {
        const p = answers.profile
        const weight = answers.metrics[0]

        return (
          <Screen>
            <ScreenTitle title="Profil" subtitle="Was die App über dich weiß" />

            <SectionHeading>Ziel</SectionHeading>
            <Card>
              <p className="text-sm font-semibold text-ink">&bdquo;{answers!.goal.rawText}&ldquo;</p>
              <p className="mt-1 text-sm text-muted">
                Eingeordnet als {ARCHETYPE_LABEL[week.strategy.archetype]}
                {answers!.goal.classifiedBy === 'keywords' && ' (ohne KI erkannt)'}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                {weight && (
                  <>
                    <Row label="Aktuell" value={`${weight.startValue} ${weight.unit}`} numeric />
                    <Row label="Ziel" value={`${weight.targetValue} ${weight.unit}`} numeric />
                  </>
                )}
                <Row label="Zielspur" value={week.strategy.goalTrack.headline} />
              </dl>
            </Card>

            <SectionHeading>Alltag und Sport</SectionHeading>
            <Card>
              <dl className="space-y-2 text-sm">
                <Row label="Rhythmus" value={WORK_PATTERN[answers!.schedule.workPattern ?? ''] ?? 'Keine Angabe'} />
                <Row label="Freie Tage" value={`${answers!.schedule.freeSlots.length} pro Woche`} />
                <Row label="Leistungsstand" value={p.sport.experience ?? 'Keine Angabe'} />
                <Row
                  label="Ausgeschlossen"
                  value={p.sport.dislikedActivities.length > 0 ? p.sport.dislikedActivities.join(', ') : 'Nichts'}
                />
              </dl>
            </Card>

            {week.assumptions.length > 0 && (
              <>
                <SectionHeading>Angenommen, weil nicht angegeben</SectionHeading>
                <div className="flex flex-col gap-2">
                  {week.assumptions.map((a) => (
                    <Card key={a.field}>
                      <p className="text-sm font-semibold text-ink">{a.assumed}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{a.reason}</p>
                    </Card>
                  ))}
                </div>
                <Note>
                  Jede Annahme liegt bewusst auf der sicheren Seite. Trägst du den echten Wert nach,
                  wird der Plan genauer.
                </Note>
              </>
            )}

            <SectionHeading>Ziel wechseln</SectionHeading>
            <Button variant="quiet" onClick={() => router.push('/onboarding')}>
              Neues Ziel setzen
            </Button>
            <Note>
              Dein bisheriges Ziel wird pausiert, nicht gelöscht. Was du bis jetzt getan hast,
              bleibt Teil deiner Geschichte — und das persönliche Modell lernt weiter daraus.
            </Note>

            <SectionHeading>KI-Unterstützung</SectionHeading>
            {provider === null ? (
              <Card>
                <p className="text-sm font-semibold text-ink">Kein KI-Anbieter eingerichtet</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Die App plant vollständig ohne. Ziel einordnen, Plan bauen, Muster erkennen
                  und Experimente auswerten passiert auf dem Server dieser App und geht an
                  niemanden sonst — nur die freieren Vorschläge und der Wochenimpuls fehlen.
                </p>
              </Card>
            ) : (
              <>
                <AiConsent initial={consent} provider={provider} />
                {consent.granted && (
                  <div className="mt-3">
                    <Button variant="quiet" onClick={() => router.push('/ai')}>
                      {answers.goal.classifiedBy === 'ai'
                        ? 'Ziel noch einmal von der KI ansehen lassen'
                        : 'Ziel jetzt von der KI ansehen lassen'}
                    </Button>
                    <Note>
                      {answers.goal.classifiedBy === 'ai'
                        ? 'Sie liest dein Ziel neu, fragt nach, was ihr fehlt, und entwirft die Aktionen noch einmal.'
                        : 'Dein Ziel wurde ohne KI eingeordnet — vermutlich, weil es entstand, bevor ein Anbieter eingerichtet war. Das Häkchen allein holt das nicht nach.'}
                    </Note>
                  </div>
                )}
              </>
            )}

            <SectionHeading>Darstellung</SectionHeading>
            <ThemeSetting current={theme} />
            <Note>
              „System“ folgt der Einstellung deines Handys und wechselt abends mit. Die Wahl
              gilt für dieses Gerät.
            </Note>

            <SectionHeading>Sprache</SectionHeading>
            <Card>
              <p className="text-sm font-semibold text-ink">Deutsch</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Englisch ist geplant. Es fehlt noch, weil auch die Begründungen im Plan
                übersetzt werden müssen — halb übersetzt wäre schlechter als gar nicht.
              </p>
            </Card>

            <SectionHeading>Konto</SectionHeading>
            <SignOutButton />
          </Screen>
        )
      }}
    </RequirePlan>
  )
}

function Row({
  label,
  value,
  /** A measurement, so it is set in the face that measures. */
  numeric = false,
}: {
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-medium text-ink${numeric ? ' num' : ''}`}>{value}</dd>
    </div>
  )
}
