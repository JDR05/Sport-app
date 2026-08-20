'use client'

import { useRouter } from 'next/navigation'
import { usePlan } from '@/components/PlanProvider'
import { RequirePlan } from '@/components/RequirePlan'
import { SignOutButton } from '@/components/SignOutButton'
import { Button, Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'

import type { GoalArchetype } from '@/lib/domain/types'

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

export default function ProfilePage() {
  const router = useRouter()
  const { answers, reset } = usePlan()

  return (
    <RequirePlan>
      {(plan) => {
        const p = answers!.profile
        const weight = answers!.metrics[0]

        return (
          <Screen>
            <ScreenTitle title="Profil" subtitle="Was die App über dich weiß" />

            <SectionHeading>Ziel</SectionHeading>
            <Card>
              <p className="text-sm font-semibold text-ink">&bdquo;{answers!.goal.rawText}&ldquo;</p>
              <p className="mt-1 text-sm text-muted">
                Eingeordnet als {ARCHETYPE_LABEL[plan.strategy.archetype]}
                {answers!.goal.classifiedBy === 'keywords' && ' (ohne KI erkannt)'}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                {weight && (
                  <>
                    <Row label="Aktuell" value={`${weight.startValue} ${weight.unit}`} />
                    <Row label="Ziel" value={`${weight.targetValue} ${weight.unit}`} />
                  </>
                )}
                <Row label="Zielspur" value={plan.strategy.goalTrack.headline} />
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

            {plan.assumptions.length > 0 && (
              <>
                <SectionHeading>Angenommen, weil nicht angegeben</SectionHeading>
                <div className="flex flex-col gap-2">
                  {plan.assumptions.map((a) => (
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

            <SectionHeading>Von vorn beginnen</SectionHeading>
            <Button
              variant="quiet"
              onClick={() => {
                reset()
                router.replace('/onboarding')
              }}
            >
              Antworten löschen und neu starten
            </Button>
            <SectionHeading>Konto</SectionHeading>
            <SignOutButton />
            <Note>
              Deine Antworten liegen aktuell nur in diesem Browser. Die Übertragung in dein
              Konto kommt im nächsten Entwicklungsschritt.
            </Note>
          </Screen>
        )
      }}
    </RequirePlan>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}
