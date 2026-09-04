'use client'

import { useRouter } from 'next/navigation'
import { RequirePlan } from '@/components/RequirePlan'
import Link from 'next/link'
import { AccountData } from '@/components/AccountData'
import { Reminders } from '@/components/Reminders'
import type { ReminderSettings } from '@/lib/db/push'
import { SignOutButton } from '@/components/SignOutButton'
import { ThemeSetting } from '@/components/ThemeSetting'
import { Button, Card, LinkButton, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
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
  learnsFromData,
  consent,
  reminders,
}: {
  answers: StoredPlanInput
  theme: Theme
  provider: string | null
  /** Whether the configured tier lets the provider learn from what is sent. */
  learnsFromData: boolean
  consent: ConsentView
  reminders: ReminderSettings
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
                <Row
                  label="Feste Termine"
                  value={
                    answers!.schedule.commitments.length > 0
                      ? `${answers!.schedule.commitments.length} pro Woche`
                      : 'Keine eingetragen'
                  }
                  numeric={answers!.schedule.commitments.length > 0}
                />
                <Row label="Leistungsstand" value={p.sport.experience ?? 'Keine Angabe'} />
                <Row
                  label="Ausgeschlossen"
                  value={p.sport.dislikedActivities.length > 0 ? p.sport.dislikedActivities.join(', ') : 'Nichts'}
                />
              </dl>

              {/* The one thing on this screen that changes rather than
                  reports. A week is not fixed — a season starts, a shift
                  pattern changes — and it used to be enterable only once, at
                  signup, on the day nobody has their week straight. */}
              <div className="mt-4">
                <LinkButton href="/commitments" variant="quiet">
                  Feste Termine ändern
                </LinkButton>
              </div>
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
            <Note>Das alte Ziel wird pausiert, nicht gelöscht. Alles Bisherige bleibt.</Note>

            <SectionHeading>KI-Unterstützung</SectionHeading>
            {provider === null ? (
              <Card>
                <p className="text-sm font-semibold text-ink">Kein KI-Anbieter eingerichtet</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Die App plant vollständig ohne. Es fehlen nur die freieren Vorschläge und
                  der Wochenimpuls.
                </p>
              </Card>
            ) : (
              <>
                <AiConsent initial={consent} provider={provider} learnsFromData={learnsFromData} />
                {consent.granted && (
                  <div className="mt-3">
                    <Button variant="quiet" onClick={() => router.push('/ai')}>
                      {answers.goal.classifiedBy === 'ai'
                        ? 'Ziel noch einmal von der KI ansehen lassen'
                        : 'Ziel jetzt von der KI ansehen lassen'}
                    </Button>
                    <Note>
                      {answers.goal.classifiedBy === 'ai'
                        ? 'Liest dein Ziel neu und entwirft die Aktionen noch einmal.'
                        : 'Dein Ziel wurde ohne KI eingeordnet. Das Häkchen allein holt das nicht nach.'}
                    </Note>
                  </div>
                )}
              </>
            )}

            {/* Above the display settings, because it is the one thing here
                that changes whether the app gets used at all. */}
            <Reminders enabled={reminders.enabled} hour={reminders.remindHour} />

            <SectionHeading>Darstellung</SectionHeading>
            <ThemeSetting current={theme} />
            <Note>„System“ folgt deinem Handy. Gilt für dieses Gerät.</Note>

            <SectionHeading>Sprache</SectionHeading>
            <Card>
              <p className="text-sm font-semibold text-ink">Deutsch</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Englisch ist geplant.
              </p>
            </Card>

            <SectionHeading>Konto</SectionHeading>
            <SignOutButton />

            {/* The two rights, where somebody would look for them. Not in a
                footer and not behind a support address: Articles 15/20 and 17
                are things a person may do, not things they may request. */}
            <div className="mt-8">
              <AccountData />
            </div>

            {/* Reachable from inside the app, not only from the login screen.
                § 5 DDG wants an Impressum at most two taps from any page, and
                somebody who is signed in never sees the login screen again. */}
            <div className="mt-8 flex gap-4 text-xs text-faint">
              <Link href="/impressum" className="underline decoration-line underline-offset-4">
                Impressum
              </Link>
              <Link href="/datenschutz" className="underline decoration-line underline-offset-4">
                Datenschutz
              </Link>
            </div>
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
