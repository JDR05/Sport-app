'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AiConsent, type ConsentView } from '@/components/AiConsent'
import { IntakeQuestionsStep } from '@/app/onboarding/IntakeQuestionsStep'
import { Button, Card, Note, Screen, ScreenTitle, SectionHeading } from '@/components/ui'
import { finishAiForGoal, startAiForGoal } from '../actions'
import { AI_FAILURE_TEXT } from '@/lib/ai/failure-text'
import type { AiFailure } from '@/lib/ai'
import type { IntakeQuestion } from '@/lib/ai/schemas'
import type { ClassifiedBy, GoalArchetype, IntakeAnswer } from '@/lib/domain/types'

const ARCHETYPE_LABEL: Record<GoalArchetype, string> = {
  body_composition: 'Körper und Gewicht',
  strength: 'Kraft und Muskelaufbau',
  endurance: 'Ausdauer',
  sleep_recovery: 'Schlaf und Erholung',
  nutrition_quality: 'Ernährungsqualität',
  habit_routine: 'Gewohnheit und Routine',
  general_health: 'Allgemeine Gesundheit',
}

type Phase =
  | { name: 'idle' }
  | { name: 'working' }
  | { name: 'asking'; questions: IntakeQuestion[]; reclassified: GoalArchetype | null }
  | {
      name: 'done'
      answered: boolean
      reclassified: GoalArchetype | null
      /** Why it did not work, when it did not. Null on success. */
      failure: AiFailure | null
      /** The provider's own words. Often more useful than anything I can write. */
      detail: string | null
    }

export function AiCatchUpView({
  goalText,
  classifiedBy,
  hasProposal,
  provider,
  learnsFromData,
  consent,
}: {
  goalText: string
  classifiedBy: ClassifiedBy
  hasProposal: boolean
  provider: string | null
  /** Whether the configured tier lets the provider learn from what is sent. */
  learnsFromData: boolean
  consent: ConsentView
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [granted, setGranted] = useState(consent.granted)

  const start = async () => {
    setPhase({ name: 'working' })
    const result = await startAiForGoal()
    if (result.questions.length > 0) {
      setPhase({ name: 'asking', questions: result.questions, reclassified: result.reclassified })
      return
    }
    await submit([], result.reclassified, result.failure, result.detail)
  }

  const submit = async (
    answers: IntakeAnswer[],
    reclassified: GoalArchetype | null,
    /**
     * The reason the *classification* failed, when it did.
     *
     * Shown here because both calls go to the same provider with the same
     * model: if the classification could not get through, the proposal had no
     * chance either, and that is the case worth explaining. When only the
     * proposal fails the screen stays general and the specifics are in the
     * server log — a schema or safety refusal is not something the person can
     * fix from their phone anyway.
     */
    failure: AiFailure | null = null,
    detail: string | null = null,
  ) => {
    setPhase({ name: 'working' })
    const result = await finishAiForGoal(answers)
    setPhase({
      name: 'done',
      answered: result.ok,
      reclassified,
      failure: result.ok ? null : failure,
      detail: result.ok ? null : detail,
    })
    router.refresh()
  }

  if (phase.name === 'asking') {
    return (
      <IntakeQuestionsStep
        questions={phase.questions}
        onDone={(answers) => void submit(answers, phase.reclassified)}
        saving={false}
        error={null}
      />
    )
  }

  return (
    <Screen>
      <ScreenTitle
        title="KI für dein Ziel"
        subtitle="Dein Ziel steht schon. Hier kannst du es der KI zeigen, ohne noch einmal von vorn anzufangen."
      />

      <SectionHeading>Dein Ziel</SectionHeading>
      <Card tone="accent">
        <p className="text-[15px] font-semibold leading-snug text-ink">&bdquo;{goalText}&ldquo;</p>
        <p className="mt-1 text-sm text-muted">
          {classifiedBy === 'ai'
            ? 'Von der KI eingeordnet.'
            : classifiedBy === 'user'
              ? 'Von dir selbst eingeordnet.'
              : 'Ohne KI eingeordnet — anhand von Schlüsselwörtern.'}
        </p>
      </Card>

      {provider === null ? (
        <>
          <SectionHeading>Kein Anbieter eingerichtet</SectionHeading>
          <Card>
            <p className="text-sm leading-relaxed text-muted">
              Es ist kein KI-Anbieter konfiguriert, deshalb gibt es hier nichts zu holen. Die App
              plant weiter deterministisch — das funktioniert, ist bei ungewöhnlichen Zielen aber
              deutlich schwächer.
            </p>
          </Card>
        </>
      ) : (
        <>
          {/* Rendered whether or not the box is ticked.
              
              It used to disappear the moment somebody ticked it, which broke it
              twice over: a mis-tap could only be undone from another screen,
              and a failed write took its own error message with it — AiConsent
              corrects `granted` back to false through the same callback, so the
              box silently reappeared unticked with nothing saying why. A
              control that vanishes on use cannot report what it did. */}
          <SectionHeading>Zustimmung</SectionHeading>
          <AiConsent
            initial={consent}
            provider={provider}
            learnsFromData={learnsFromData}
            onChange={(state) => setGranted(state.granted)}
          />
        </>
      )}

      {provider !== null && granted && (phase.name === 'done' ? (
        <>
          <SectionHeading>Erledigt</SectionHeading>
          <Card>
            <p className="text-sm font-semibold text-ink">
              {phase.answered ? 'Die KI hat geantwortet.' : 'Die KI hat nichts geliefert.'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {phase.answered
                ? 'Ihr Vorschlag ist gespeichert und fließt in den Plan der nächsten Woche ein. Diese Woche bleibt, wie sie ist — sie ist schon halb gelebt, und zwei Pläne für dieselben Tage wären doppelte Spuren von einer Woche.'
                : (phase.failure !== null && AI_FAILURE_TEXT[phase.failure]) ||
                  'Der Plan wird weiter deterministisch gebaut, wie bisher.'}
            </p>
            {!phase.answered && phase.detail && (
              // The provider's answer, verbatim and trimmed. React escapes it,
              // and it is the provider talking about the request rather than
              // anything of the person's — so there is nothing here to leak and
              // usually the exact instruction needed. A retired model says which
              // one to use instead; no sentence of mine competes with that.
              <p className="mt-2 break-words font-mono text-xs leading-relaxed text-faint">
                {phase.detail.slice(0, 300)}
              </p>
            )}
            {phase.reclassified && (
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Sie liest dein Ziel außerdem anders als die Wortliste: jetzt{' '}
                <span className="font-semibold text-ink">{ARCHETYPE_LABEL[phase.reclassified]}</span>.
                Das ändert, welche Sicherheitsgrenzen gelten. Im Profil kannst du es korrigieren.
              </p>
            )}
          </Card>
          <div className="mt-6">
            <Button onClick={() => router.push('/today')}>Zurück zu Heute</Button>
          </div>
        </>
      ) : (
        <>
          <SectionHeading>{hasProposal ? 'Noch einmal fragen' : 'Die KI dazuholen'}</SectionHeading>
          <Card>
            <p className="text-sm leading-relaxed text-muted">
              Die KI liest dein Ziel, stellt vielleicht ein bis drei Rückfragen und entwirft dann
              Aktionen dafür. {hasProposal
                ? 'Ein Vorschlag liegt schon vor — das hier ersetzt ihn.'
                : 'Dein Ziel wurde nie von einem Modell gesehen: es entstand, bevor einer eingerichtet war.'}
            </p>
          </Card>
          <div className="mt-6">
            <Button onClick={start} disabled={phase.name === 'working'}>
              {phase.name === 'working' ? 'Die KI schaut sich das an …' : 'KI dazuholen'}
            </Button>
          </div>
          <Note>
            Dein bisheriger Fortschritt bleibt vollständig erhalten — es wird nichts neu
            aufgesetzt und nichts gelöscht. Der neue Plan startet mit der nächsten Woche.
          </Note>
        </>
      ))}
    </Screen>
  )
}
